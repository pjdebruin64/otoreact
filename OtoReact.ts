// Global settings
const defaultSettings = {
    bAbortOnError:  false,  // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    true,   // Show runtime errors as text in the DOM output
    bStripSpaces:   true,   // To do
    bRunScripts:    false,
    bBuild:         true,
}
type FullSettings = typeof defaultSettings
type Settings = { [Property in keyof FullSettings]+?: FullSettings[Property] }

export function RCompile(elm: HTMLElement, settings?: Settings) {    
    try {

        const R = RHTML;
        R.Compile(elm, {...defaultSettings, ...settings});
        R.ToBuild.push({parent: elm, start: elm.firstChild, bInit: true, env: NewEnv(), })

        if (R.Settings.bBuild)
            R.RUpdate();
        
        return R;
    }
    catch (err) {
        window.alert(`Re-Act error: ${err}`);
    }
}


// Een context is een rij identifiers die in een te transformeren DOM-tree kunnen voorkomen, maar waarvan de waarde nog niet bekend is
type Context = Array<string>;
// Een environment is een rij concrete waarden voor de identifiers IN EEN GEGEVEN CONTEXT
type Environment = 
    Array<unknown> 
    & {
        constructDefs: Map<string, {instanceBuilders: ElmBuilder[], constructEnv: Environment}>
    };
type SavedContext = number;
function NewEnv(): Environment { 
    const env = [] as Environment;
    env.constructDefs = new Map();
    return env;
}
function CloneEnv(env: Environment): Environment {
    const clone = env.slice() as Environment;
    clone.constructDefs = new Map(env.constructDefs.entries());
    return clone;
}
// Een afhankelijke waarde in een gegeven context is een waarde die afhangt van een environment.
// Dit wordt de betekenis, denotatie, van een expressie van type T.
type Dependent<T> = (env: Environment) => T;

type Marker = ChildNode & {
    nextM?: Marker, rResult?: unknown, rValue?: unknown,
    hash?: Hash, key?: Key, keyMap?: Map<Key, Subscriber>,
    errorNode?: Text,
};
type Region     = {
    parent: Element, marker?: Marker, start:  Marker, bInit: boolean, env: Environment, lastMarker?: Marker,
};
type ElmBuilder = ((this: RCompiler, reg: Region) => void) & {bTrim?: boolean};
type ParentNode = HTMLElement|DocumentFragment;
//type FragmentCompiler = (srcParent: ParentNode, srcElm: HTMLElement) => ElmBuilder

type Subscriber = {parent: Element, marker: ChildNode, env: Environment, builder: ElmBuilder };

type Handler = (ev:Event) => any;
type LVar = (env: Environment) => (value: unknown) => void;

interface Item {};  // Three unknown but distinct types
interface Key {};
interface Hash {};

type ConstructBuilder = (slotBuilders: Array<ConstructBuilder[]>) => ElmBuilder[];

type Parameter = {name: string, pdefault: Dependent<unknown>, initVar?: LVar};
class Construct {
    constructor(
        public TagName: string,
        public Parameters: Array<Parameter> = [],
        public Slots = new Map<string, Construct>(),
    ){ }

    //InstanceBuilders: ElmBuilder[]; // These builders must be executed to build an INSTANCE of the construct.
    // In case of a component, there will be one, obtained from the component template.
    // In case of slots, there may be multiple builders.
}

type RVAR_Light<T> = T & {
    _Subscribers?: Array<Subscriber>,
    _UpdatesTo?: Array<_RVAR<unknown>>,
    Subscribe?: (sub:Subscriber) => void
};

const globalEval = eval, globalFetch = fetch;

enum ModifierType {Attr, Prop, Class, Style, Event, PseudoEvent, AddToStyle, AddToClassList}

let num=0;
class RCompiler {
    instanceNum = num++;
    private Context: Context;
    private ContextMap: Map<string, number>;

    private Constructs: Map<string, Construct>;

    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(clone?: RCompiler) { 
        this.Context    = clone ? clone.Context.slice() : [];
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings   = clone ? {...clone.Settings} : undefined;
    }

    private restoreActions: Array<() => void> = [];

    private Save(): SavedContext {
        return this.restoreActions.length;
    }
    private Restore(savedContext: SavedContext) {
        for (let j=this.restoreActions.length; j>savedContext; j--)
            this.restoreActions.pop()();
    }

    private NewVar(name: string): LVar {
        if (!name)
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
            return (_) => (_) => {};
            
        // Anders moet het een geldige JavaScript identifier zijn
        if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(name))
            throw `Invalid identifier '${name}'`;

        let i = this.ContextMap.get(name);
        const bNewName = i == null;
        if (bNewName){
            i = this.Context.push(name) - 1;
            this.ContextMap.set(name, i);
            this.restoreActions.push(
                () => this.ContextMap.delete( this.Context.pop() )
            );
        }
        return function InitVar(this: RCompiler, env: Environment) {
            const prev = env[i];
            this.restoreActions.push( () => {env[i] = prev;} );
            
            return function SetVar(value: unknown) {
                env[i] = value;
            }
        }.bind(this) as LVar            
    }

    private AddConstruct(C: Construct) {
        const CName = C.TagName, savedConstr = this.Constructs.get(C.TagName);
        this.Constructs.set(CName, C);
        this.restoreActions.push(
            () => this.Constructs.set(CName, savedConstr)
        );
    }

    // Compile a source tree into an ElmBuilder
    public Compile(
        elm: HTMLElement, 
        settings: Settings,
    ) {
        this.Settings = {...defaultSettings, ...settings, };
        const t0 = Date.now();
        const savedRCompiler = RHTML;
        this.Builder = this.CompileChildNodes(elm);
        RHTML = savedRCompiler;
        this.bCompiled = true;
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
    }

    public Build(reg: Region & {marker?: ChildNode}) {
        let savedRCompiler = RHTML;
        RHTML = this;
        this.Builder(reg);
        this.AllRegions.push({
            parent: reg.parent, marker: reg.marker, builder: this.Builder, env: NewEnv()
        })
        RHTML = savedRCompiler;
    }

    public Settings: FullSettings;
    public ToBuild: Region[] = [];
    private AllRegions: Subscriber[] = [];
    private Builder: ElmBuilder;
    private bTrimLeft: boolean = false;
    private bTrimRight: boolean = false;

    private bCompiled = false;
    private bHasReacts = false;

    public DirtyRegions = new Set<Subscriber>();
    public bSomethingDirty: boolean;

    // Bijwerken van alle elementen die afhangen van reactieve variabelen
    private bUpdating = false;
    private handleUpdate: number = null;
    public RUpdate = function RUpdate(this: RCompiler) {
        //clearTimeout(this.handleUpdate);
        if (!this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 0);
    }.bind(this) as () => void;

    private DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        
        this.bUpdating = true;
        let savedRCompiler = RHTML;
        try {
            if (this.ToBuild.length) {
                const t0 = Date.now();
                this.builtNodeCount = 0;
                for (const reg of this.ToBuild)
                    this.Build(reg);
                console.log(`Built ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
                this.ToBuild = [];
            }

            if (!this.bHasReacts && this.bSomethingDirty)
                for (const s of this.AllRegions) this.DirtyRegions.add(s);
            
            if (this.DirtyRegions.size) {
                RHTML = this;
                const t0 = Date.now();
                this.builtNodeCount = 0;
                this.bSomethingDirty = false;
                for (const {parent, marker, builder, env} of this.DirtyRegions) {
                    try { 
                        builder.call(this, {parent, start: marker ? marker.nextSibling : parent.firstChild, env, }); 
                    }
                    catch (err) {
                        const msg = `ERROR: ${err}`;
                        console.log(msg);
                    }
                }
                console.log(`Updated ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
            }
        }
        finally { 
            this.DirtyRegions.clear();
            RHTML = savedRCompiler;this.bUpdating = false;
         }
    }

    /* A "responsive variable" is a variable which listeners can subscribe to.
    */
    RVAR = function<T>(this: RCompiler,
        name?: string, 
        initialValue?: T, 
        store?: Store
    ) {
        return new _RVAR<T>(this, name, initialValue, store, name);
    }.bind(this) as <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>;
    
    private RVAR_Light<T>(
        t: RVAR_Light<T>, 
        //: Array<Subscriber> = [],
        updatesTo: Array<_RVAR<unknown>> = [],
    ): RVAR_Light<T> {
        if (!t._Subscribers) {
            t._Subscribers = []; //subscribers;
            t._UpdatesTo = updatesTo;
            const R: RCompiler = this;
            Object.defineProperty(t, 'U',
                {get:
                    function() {
                        for (const sub of t._Subscribers)
                            R.DirtyRegions.add(sub);
                        if (t._UpdatesTo.length)
                            for (const rvar of t._UpdatesTo)
                                rvar.SetDirty();
                        else
                            R.RUpdate();
                        return t;
                    }
                }
            );
            //Object.defineProperty(t, 'V', {get: () => this});
            t.Subscribe = function(sub: Subscriber) { t._Subscribers.push(sub); } ;
        }
        return t;
    }

    private sourceNodeCount = 0;   // To check for empty Content
    public builtNodeCount = 0;

    private CompileChildNodes(
        srcParent: ParentNode,
        bBlockLevel?: boolean,
        childNodes: ChildNode[] = Array.from( srcParent.childNodes )
    ): ElmBuilder {
        const builders = [] as Array< [ElmBuilder, ChildNode, boolean?] >;
        const saved = this.Save();
        this.sourceNodeCount += childNodes.length;

        for (const srcNode of childNodes)
        {
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    builders.push(... this.CompileElement(srcParent, srcNode as HTMLElement, bBlockLevel));
                    if (builders.length && builders[builders.length - 1][0].bTrim) {
                        let i = builders.length - 2;
                        while (i>=0 && builders[i][2]) {
                            srcParent.removeChild(builders[i][1]);
                            builders.splice(i, 1);
                            i--;
                        }
                    }
                    break;

                case Node.TEXT_NODE:
                    const str = (srcNode as Text).data
                        .replace(/^[ \t\r\n]+/g, this.bTrimLeft ? '' : ' ')
                        .replace(/\[ \t\r\n]+$/, ' ');

                    if (str != '') {
                        this.bTrimLeft = / $/.test(str);
                        const getText = this.CompileInterpolatedString( str );
                        function Text(region: Region) {
                            const {start, lastMarker, bInit} = region, content = getText(region.env);
                            let text: Text;
                            if (bInit && start != srcNode)
                                text = region.parent.insertBefore(document.createTextNode(content), start);
                            else {
                                (text = (start as Text)).data = content;
                                region.start = start.nextSibling;
                            }
                            if (lastMarker) {
                                lastMarker.nextM = text;
                                region.lastMarker = null;
                            }
                            
                        }

                        builders.push( [ Text, srcNode, getText.isBlank] );
                    }
                    else
                        srcParent.removeChild(srcNode);
                    break;

                default:    // Other nodes (especially comments) are removed
                    srcParent.removeChild(srcNode);
                    continue;
            }
        };

        this.Restore(saved);

        return function ChildNodes(region) {
                const saved = this.Save();
                try {
                    for (const [builder, node] of builders)
                        this.CallWithErrorHandling(builder, node, region);
                    this.builtNodeCount += builders.length;
                }
                finally {
                    this.Restore(saved);
                }
            };
    }

    private CompileElement(srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel?: boolean): [ElmBuilder, ChildNode][] {
        let builder: ElmBuilder = null;
        const reactOn = srcElm.getAttribute('reacton');
        if (reactOn != null)
            srcElm.attributes.removeNamedItem('reacton');
        try {
            // See if this node is a user-defined construct (component or slot) instance
            const construct = this.Constructs.get(srcElm.tagName)
            if (construct)
                builder = this.CompileConstructInstance(srcParent, srcElm, construct);
            else
                switch (srcElm.nodeName) {
                    case 'DEF':
                    case 'DEFINE': { // 'LET' staat de parser niet toe.
                        // En <DEFINE> moet helaas afgesloten worden met </DEFINE>; <DEFINE /> wordt niet herkend.
                        srcParent.removeChild(srcElm);
                        const rvarName = GetAttribute(srcElm, 'rvar');
                        const varName = rvarName || GetAttribute(srcElm, 'name') || GetAttribute(srcElm, 'var', true);
                        const getValue = this.CompileAttributeExpression<unknown>(srcElm, 'value');
                        const getStore = rvarName && this.CompileAttributeExpression<Store>(srcElm, 'store');
                        const newVar = this.NewVar(varName);
                        const bReact = GetAttribute(srcElm, 'react') != null;

                        builder = function DEFINE(region) {
                                const {marker} = PrepareRegion(srcElm, region);
                                if (region.bInit || bReact){
                                    const value = getValue && getValue(region.env);
                                    marker.rValue = rvarName 
                                        ? new _RVAR(this, null, value, getStore && getStore(region.env), rvarName) 
                                        : value;
                                }
                                newVar(region.env)(marker.rValue);
                            };
                    } break;

                    case 'IF':
                    case 'CASE': {
                        const caseList: Array<{condition: Dependent<boolean>, builder: ElmBuilder, child: HTMLElement}> = [];
                        const getCondition = (srcElm.nodeName == 'IF') && this.CompileAttributeExpression<boolean>(srcElm, 'cond', true);
                        const bodyNodes: ChildNode[] = [];
                        const bTrimLeft = this.bTrimLeft;
                        for (const child of srcElm.children as Iterable<HTMLElement>) {
                            switch (child.nodeName) {
                                case 'WHEN':
                                    caseList.push({
                                        condition: this.CompileAttributeExpression<boolean>(child, 'cond', true)
                                        , builder: this.CompileChildNodes(child, bBlockLevel)
                                        , child
                                    });
                                    break;
                                case 'ELSE':
                                    caseList.push({
                                        condition: (_env) => true
                                        , builder: this.CompileChildNodes(child, bBlockLevel)
                                        , child
                                    });
                                    break;
                                default: bodyNodes.push(child);
                            }
                            this.bTrimLeft = bTrimLeft;
                        }
                        if (getCondition)
                            caseList.unshift({
                                condition: getCondition,
                                builder: this.CompileChildNodes(srcElm, bBlockLevel, bodyNodes),
                                child: srcElm
                            });

                        builder = function CASE(region) {
                            let result: ElmBuilder = null;
                            for (const alt of caseList)
                                try {
                                    if (alt.condition(region.env)) {
                                        result = alt.builder; break;
                                    }
                                } catch (err) { throw `${OuterOpenTag(alt.child)}${err}`; }
                                
                            const subregion = PrepareRegion(srcElm, region, result);
                            if (result)
                                result.call(this, subregion);
                        };
                        this.bTrimLeft = false;
                    } break;
                            
                    case 'FOR':
                    case 'FOREACH':
                        builder = this.CompileForeach(srcParent, srcElm, bBlockLevel);
                    break;
                        
                    case 'INCLUDE': {
                        const src = GetAttribute(srcElm, 'src', true);
                        // Placeholder that will contain a Template when the file has been received
                        let C: RCompiler = new RCompiler(this);
                        // List of nodes that have to be build when the builder is received
                        let arrToBuild: Array<Region> = [];
                        
                        globalFetch(src)
                        .then(async response => {
                            //if (response.status != 200)

                            const textContent = await response.text();
                            // Parse the contents of the file
                            const parser = new DOMParser();
                            const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;

                            // Compile the parsed contents of the file in the original context
                            C.Compile(parsedContent.body, this.Settings, );
                            this.bHasReacts ||= C.bHasReacts;

                            // Achterstallige Builds uitvoeren
                            for (const region of arrToBuild)
                                if (region.parent.isConnected)   // Sommige zijn misschien niet meer nodig
                                    C.Builder(region);

                            arrToBuild = null;
                        });

                        builder = 
                            // Runtime routine
                            function INCLUDE(region) {

                                // Als de builder ontvangen is, dan meteen uitvoeren
                                if (C.bCompiled)
                                    C.Builder(region);
                                else {
                                    // Anders het bouwen uitstellen tot later
                                    const subregion = PrepareRegion(srcElm, region);
                                    subregion.env = CloneEnv(subregion.env);    // Kopie van de environment maken
                                    arrToBuild.push(subregion);
                                }
                            };
                    } break;

                    case 'IMPORT': {
                        const src = GetAttribute(srcElm, 'src', true);
                        const mapComponents = new Map<string, [Construct, ElmBuilder[], RCompiler]>();
                        let arrToBuild: Array<[Region, string]> = [];
                        for (const child of srcElm.children) {
                            const component = this.ParseSignature(child);
                            function holdOn(region: Region) {
                                const subregion = PrepareRegion(srcElm, region);
                                subregion.env = CloneEnv(subregion.env);    // Kopie van de environment maken
                                arrToBuild.push([subregion, child.tagName]);
                            }
                            const saved = this.CreateComponentVars(component);
                            mapComponents.set(child.tagName, [component, [holdOn], new RCompiler(this)]);
                            this.Restore(saved);

                            this.AddConstruct(component);
                        }
                        
                        globalFetch(src)
                        .then(async response => {
                            const textContent = await response.text();
                            // Parse the contents of the file
                            const parser = new DOMParser();
                            const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;
                            for (const libElm of parsedContent.body.children as Iterable<HTMLElement>)
                                if (libElm.tagName=='COMPONENT') {
                                    const triple = mapComponents.get(libElm.firstElementChild.tagName);
                                    if (triple){
                                        const [component, instanceBuilders, compiler] = triple;
                                        compiler.Settings.bRunScripts = true;
                                        const {elmTemplate, builders} = compiler.AnalyseComponent(libElm);
                                        const instanceBuilder = compiler.CompileConstructTemplate(component, elmTemplate.content, elmTemplate);
                                        this.bHasReacts ||= compiler.bHasReacts;
                                        instanceBuilders.length = 0;
                                        instanceBuilders.push(...builders.map((b)=>b[0]), instanceBuilder)
                                        triple[2] = undefined;
                                    }
                                }
                            for (const [tagName, triple] of mapComponents.entries())
                                if (triple[2])
                                    throw `Component ${tagName} is missing in '${src}'`;

                            for (const [region, tagName] of arrToBuild)
                                if (region.parent.isConnected)
                                    for (const builder of mapComponents.get(tagName)[1])
                                        builder.call(this, region);
                            arrToBuild.length = 0;
                        });

                        srcParent.removeChild(srcElm);

                        builder = function IMPORT({env}: Region) {
                            const constructEnv = CloneEnv(env);
                            for (const [{TagName}, instanceBuilders] of mapComponents.values()) {
                                const prevDef = env.constructDefs.get(TagName);
                                env.constructDefs.set(TagName, {instanceBuilders, constructEnv});
                                this.restoreActions.push(
                                    () => { env.constructDefs.set(TagName,  prevDef); }
                                );
                            }
                        }

                    }; break

                    case 'REACT': {
                        this.bHasReacts = true;
                        const expList = GetAttribute(srcElm, 'on', true, true).split(',');
                        const getDependencies = expList.map( expr => this.CompileExpression<_RVAR<unknown>>(expr) );

                        // We transformeren de template in een routine die gewenste content genereert
                        const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                        
                        builder = function REACT(region) {
                            let subregion = PrepareRegion(srcElm, region);

                            if (subregion.bInit) {
                                if (subregion.start == srcElm) {
                                    subregion.start = srcElm.firstChild;
                                    srcElm.replaceWith(...srcElm.childNodes );
                                }

                                const subscriber: Subscriber = {
                                    ...subregion,
                                    builder: bodyBuilder,
                                    env: CloneEnv(subregion.env),
                                };
                        
                                // Subscribe bij de gegeven variabelen
                                for (const getRvar of getDependencies) {
                                    const rvar = getRvar(subregion.env);
                                    rvar.Subscribe(subscriber);
                                }
                            }
        
                            bodyBuilder.call(this, subregion);
                        }
                    } break;

                    case 'RHTML': {
                        const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                        srcParent.removeChild(srcElm);

                        builder = function RHTML(region) {
                            const tempElm = document.createElement('RHTML');
                            bodyBuilder.call(this, {parent: tempElm, start: null, env: region.env, bInit: true});
                            const result = tempElm.innerText

                            const subregion = PrepareRegion(srcElm, region, result);

                            if (subregion.bInit) {
                                tempElm.innerHTML = tempElm.innerText;

                                const R = new RCompiler();
                                subregion.env = NewEnv();
                                R.Compile(tempElm, {bRunScripts: true });

                                R.Build(subregion);
                            }
                        };                                
                    } break;

                    case 'SCRIPT': 
                        builder = this.CompileScript(srcParent, srcElm); break;

                    case 'STYLE':
                        builder = this.CompileStyle(srcParent, srcElm); break;

                    case 'COMPONENT': 
                        return this.CompileComponent(srcParent, srcElm);

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        builder = this.CompileHTMLElement(srcElm); break;
                }
        }
        catch (err) { 
            throw `${OuterOpenTag(srcElm)} ${err}`; 
        }

        if (reactOn) {
            this.bHasReacts = true;
            const getDependencies = reactOn.split(',').map( expr => this.CompileExpression<_RVAR<unknown>>(expr) );

            const bodyBuilder = builder;
            builder = function REACT(region) {
                let {parent, marker} = PrepareRegion(srcElm, region, null, null, 'reacton');

                bodyBuilder.call(this, region);

                if (region.bInit) {
                    const subscriber: Subscriber = {
                        parent, marker,
                        builder: function reacton(reg: Region) {
                            this.CallWithErrorHandling(bodyBuilder, srcElm, reg);
                        },
                        env: CloneEnv(region.env),
                    };
            
                    // Subscribe bij de gegeven variabelen
                    for (const getRvar of getDependencies) {
                        const rvar = getRvar(region.env);
                        rvar.Subscribe(subscriber);
                    }
                }
            }
        }
        if (builder)
            return [[builder, srcElm]];
        return [];
    }

    private CallWithErrorHandling(builder: ElmBuilder, srcNode: ChildNode, region: Region){
        let start = region.start;
        if (start?.errorNode) {
            region.parent.removeChild(start.errorNode);
            start.errorNode = undefined;
        }
        try {
            builder.call(this, region);
        } 
        catch (err) { 
            const message = 
                srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode =
                    region.parent.insertBefore(
                        document.createTextNode(message), region.start
                    );
                if (start ||= region.marker)
                    start.errorNode = errorNode;
                //else debugger;
            }
        }
    }

    private CompileScript(srcParent: ParentNode, srcElm: HTMLElement) {
        srcParent.removeChild(srcElm);
        if (this.Settings.bRunScripts || srcElm.hasAttribute('nomodule')) {
            const script = srcElm.textContent;
            globalEval(`'use strict';${script}`);
        }
        return null;
    }

    private CompileStyle(srcParent: ParentNode, srcElm: HTMLElement): ElmBuilder {
        srcParent.removeChild(srcElm);
        document.head.appendChild(srcElm);
        return null;
    }

    public CompileForeach(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel: boolean) {
        const varName = GetAttribute(srcElm, 'let');
        const indexName = srcElm.getAttribute('index');
        const saved = this.Save();
        try {
            if (varName != null) { /* A regular iteration */
                const getRange = this.CompileAttributeExpression<Iterable<Item>>(srcElm, 'of', true);
                const prevName = srcElm.getAttribute('previous');

                const bUpdateable = CBool(srcElm.getAttribute('updateable'), true);
                const getUpdatesTo = this.CompileAttributeExpression<_RVAR<unknown>>(srcElm, 'updates');
            
                // Voeg de loop-variabele toe aan de context
                const initVar = this.NewVar(varName);
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);

                const getKey = this.CompileAttributeExpression<Key>(srcElm, 'key');
                const getHash = this.CompileAttributeExpression<Hash>(srcElm, 'hash');

                // Compileer alle childNodes
                if (srcElm.childNodes.length ==0)
                    throw "FOREACH has an empty body.\nIf you placed <FOREACH> within a <table>, then the parser has rearranged these elements.\nUse <table.>, <tr.> etc instead.";
                const bodyBuilder = this.CompileChildNodes(srcElm);
                
                srcParent.removeChild(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return function FOREACH(this: RCompiler, region: Region) {
                    let subregion = PrepareRegion(srcElm, region, null, (getKey == null));
                    let {parent, marker, start, env} = subregion;
                    const saved = this.Save();
                    try {
                        // Map of previous data, if any
                        const keyMap: Map<Key, Subscriber>
                            = (region.bInit ? marker.keyMap = new Map() : marker.keyMap);
                        // Map of the newly obtained data
                        const newMap: Map<Key, [Item, Hash]> = new Map();
                        const setVar = initVar(env);
                        for (const item of getRange(env)) {
                            setVar(item);
                            const hash = getHash && getHash(env);
                            const key = getKey ? getKey(env) : hash;
                            newMap.set(key ?? {}, [item, hash]);
                        }

                        function RemoveStaleItemsHere() {
                            let key: Key;
                            while (start && start != region.start && !newMap.has(key = start.key)) {
                                if (key != null)
                                    keyMap.delete(key);
                                const nextMarker = start.nextM;
                                while (start != nextMarker) {
                                    const next = start.nextSibling;
                                    parent.removeChild(start);
                                    start = next;
                                }
                            }
                        }
                        RemoveStaleItemsHere();

                        const setIndex = initIndex(env);
                        const setPrevious = initPrevious(env);

                        let index = 0, prevItem: Item = null;
                        // Voor elke waarde in de range
                        for (const [key, [item, hash]] of newMap) {
                            // Environment instellen
                            let rvar: Item =
                                ( getUpdatesTo ? this.RVAR_Light(item as object, [getUpdatesTo(env)])
                                : bUpdateable ? this.RVAR_Light(item as object)
                                : item
                                );
                            setVar(rvar);
                            setIndex(index);
                            setPrevious(prevItem);

                            let marker: Marker;
                            let subscriber = keyMap.get(key);
                            let childRegion: ReturnType<typeof PrepareRegion>;
                            if (subscriber && subscriber.marker.isConnected) {
                                // Item already occurs in the series
                                marker = subscriber.marker;
                                const nextMarker = marker.nextM;
                                
                                if (marker != start) {
                                    // Item has to be moved
                                    let node = marker
                                    while(node != nextMarker) {
                                        const next = node.nextSibling;
                                        parent.insertBefore(node, start);
                                        node = next;
                                    }
                                }
                                
                                (marker as Comment).textContent = `${varName}(${index})`;

                                subregion.bInit = false;
                                subregion.start = marker;
                                const lastMarker = subregion.lastMarker;
                                childRegion = PrepareRegion(null, subregion, null, false);
                                if (lastMarker)
                                    lastMarker.nextM = marker;
                                subregion.lastMarker = marker;
                            }
                            else {
                                // Item has to be newly created
                                subregion.bInit = true;
                                subregion.start = start;
                                childRegion = PrepareRegion(null,  subregion, null, true, `${varName}(${index})`);
                                subscriber = {
                                    ...childRegion,
                                    builder: (bUpdateable ? bodyBuilder : undefined),
                                    env: (bUpdateable ? CloneEnv(env) : undefined), 
                                }
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, subscriber);
                                }
                                marker = childRegion.marker
                                marker.key = key;
                            }

                            if (hash != null
                                && ( hash == marker.hash as Hash
                                    || (marker.hash = hash, false)
                                    )
                            ) { 
                                // Nothing
                            }
                            else    // Body berekenen
                                bodyBuilder.call(this, childRegion);

                            if (bUpdateable)
                                (rvar as _RVAR<Item>).Subscribe(subscriber);

                            prevItem = item;
                            index++;
                            
                            start = subregion.start;
                            RemoveStaleItemsHere();
                        }
                    }
                    finally { this.Restore(saved); }
                };
            }
            else { 
                /* Iterate over multiple slot instances */
                const slotName = GetAttribute(srcElm, 'of', true, true);
                const slot = this.Constructs.get(slotName)
                if (!slot)
                    throw `Missing attribute [let]`;

                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                srcParent.removeChild(srcElm);

                return function FOREACH_Slot(this: RCompiler, region) {
                    const subregion = PrepareRegion(srcElm, region);
                    const env = subregion.env;
                    const saved= this.Save();
                    const slotDef = env.constructDefs.get(slotName);
                    try {
                        const setIndex = initIndex(region.environment);
                        let index = 0;
                        for (const slotBuilder of slotDef.instanceBuilders) {
                            setIndex(index++);
                            env.constructDefs.set(slotName, {instanceBuilders: [slotBuilder], constructEnv: slotDef.constructEnv});
                            bodyBuilder.call(this, subregion);
                        }
                    }
                    finally {
                        env.constructDefs.set(slotName, slotDef);
                        this.Restore(saved);
                    }
                }
            }
        }
        finally { this.Restore(saved); }
    }

    private ParseSignature(elmSignature: Element):  Construct {
        const comp = new Construct(elmSignature.tagName);
        for (const attr of elmSignature.attributes) {
            const m = /^(#)?(.*?)(\?)?$/.exec(attr.name);
            comp.Parameters.push(
                { name: m[2]
                , pdefault: 
                    attr.value != '' 
                    ? (m[1] ? this.CompileExpression(attr.value) :  this.CompileInterpolatedString(attr.value))
                    : m[3] ? (_) => undefined
                    : null 
                }
            );
            }
        for (const elmSlot of elmSignature.children)
            comp.Slots.set(elmSlot.tagName, this.ParseSignature(elmSlot));
        return comp;
    }

    private CompileComponent(srcParent: ParentNode, srcElm: HTMLElement): [ElmBuilder, ChildNode][] {
        srcParent.removeChild(srcElm);

        const {elmSignature, elmTemplate, builders} = this.AnalyseComponent(srcElm);
        const component = this.ParseSignature(elmSignature);
        const tagName = component.TagName;

        this.AddConstruct(component);
        
        const saved = this.CreateComponentVars(component);
        try {
            // Deze builder bouwt de component-instances op
            const instanceBuilders = [
                this.CompileConstructTemplate(component, elmTemplate.content, elmTemplate)
            ];

            // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
            builders.push([  function COMPONENT({env}: Region) {
                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs
                const prevDef = env.constructDefs.get(tagName);
                env.constructDefs.set(tagName, {instanceBuilders, constructEnv: CloneEnv(env)});
                this.restoreActions.push(
                    () => { env.constructDefs.set(tagName,  prevDef); }
                );
            }, srcElm ]);
        }
        finally { this.Restore(saved); }
        
        return builders;
    }

    private AnalyseComponent(srcElm: HTMLElement) {

        const builders: [ElmBuilder, ChildNode][] = [];
        let elmSignature: HTMLElement, elmTemplate: HTMLTemplateElement;

        for (const srcChild of Array.from(srcElm.children) as Iterable<HTMLElement>)
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    const builder = this.CompileScript(srcElm, srcChild);
                    if (builder) builders.push([builder, srcChild]);
                    break;
                case 'STYLE':
                    this.CompileStyle(srcElm, srcChild);
                    break;
                case 'TEMPLATE':
                    if (elmTemplate) throw 'Double <TEMPLATE>';
                    elmTemplate = srcChild as HTMLTemplateElement;
                    break;
                default:
                    if (elmSignature) throw 'Double signature';
                    elmSignature = srcChild;
                    break;
            }
        if (!elmSignature) throw `Missing signature`;
        if (!elmTemplate) throw 'Missing <TEMPLATE>';

        return {elmSignature, elmTemplate, builders};
    }

    private CreateComponentVars(component: Construct): SavedContext {
        const saved = this.Save();
        for (const param of component.Parameters)
            param.initVar = this.NewVar(param.name);
        return saved;
    }

    private CompileSlotInstance(construct: Construct, contentNode: ParentNode, srcElm: HTMLElement): ElmBuilder {
        const saved = this.Save();
        for (const param of construct.Parameters)
            param.initVar = this.NewVar(GetAttribute(srcElm, param.name, true) || param.name);
        for (const S of construct.Slots.values())
            this.AddConstruct(S);
        try {
            return this.CompileChildNodes(contentNode);
        }
        catch (err) {throw `${OuterOpenTag(srcElm)} ${err}`;}
        finally {
            this.Restore(saved);      
        }
    }

    private CompileConstructTemplate(construct: Construct, contentNode: ParentNode, srcElm: HTMLElement, bSlot?: boolean): ElmBuilder {
        
        for (const S of construct.Slots.values())
            this.AddConstruct(S);
        try {
            return this.CompileChildNodes(contentNode);
        }
        catch (err) {throw `${OuterOpenTag(srcElm)} ${err}`;}
    }

    private CompileConstructInstance(
        srcParent: ParentNode, srcElm: HTMLElement,
        construct: Construct
    ) {
        srcParent.removeChild(srcElm);
        const tagName = construct.TagName;
        const computeParameters: Array<Dependent<unknown>> = [];
        for (const {name, pdefault} of construct.Parameters)
            try {
                let attVal: string;
                computeParameters.push(
                ( (attVal = srcElm.getAttribute(`#${name}`)) != null
                    ? this.CompileExpression( attVal )
                : (attVal = srcElm.getAttribute(name)) != null
                    ? this.CompileInterpolatedString( attVal )
                : pdefault != null
                    ? (env) => pdefault(env.constructDefs.get(construct.TagName).constructEnv)
                : thrower(`Missing parameter [${name}]`)
                ))
            }
            catch (err) { throw `[${name}]: ${err}`; }

        const slotBuilders = new Map<string, ElmBuilder[]>();
        for (const name of construct.Slots.keys())
            slotBuilders.set(name, []);

        let slotElm: HTMLElement, Slot: Construct;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE 
                && (Slot = construct.Slots.get(
                    (slotElm = (node as HTMLElement)).tagName
                    ))
            ) {
                slotBuilders.get(slotElm.tagName).push(
                    this.CompileSlotInstance(Slot, slotElm, slotElm)
                );
                srcElm.removeChild(node);
            }
        
        const contentSlot = construct.Slots.get('CONTENT');
        if (contentSlot)
            slotBuilders.get('CONTENT').push(
                this.CompileSlotInstance(contentSlot, srcElm, srcElm)
            );
        this.bTrimLeft = false;

        return function INSTANCE(this: RCompiler, region: Region) {
            const subregion = PrepareRegion(srcElm, region);
            const localEnv = subregion.env;

            // The construct-template(s) will be executed in this construct-env
            const constructDef = localEnv.constructDefs.get(tagName);
            const {instanceBuilders, constructEnv} =  constructDef;
            subregion.env = constructEnv
            // In case the construct is recursive, it need to know it's own defining environment
            const savedDef = constructEnv.constructDefs.get(tagName)
            constructEnv.constructDefs.set(tagName, constructDef);   // Circular...

            const saved = this.Save();
            try {
                // Add the parameter values to the construct-env
                let i = 0;
                for ( const param of construct.Parameters) {
                    param.initVar(constructEnv)(computeParameters[i](localEnv));
                    i++;
                }
                if (construct.Slots.size) {
                    // The instance-builders of the slots are to be installed
                    const slotEnv = CloneEnv(localEnv);
                    for (const slotName of construct.Slots.keys()) {
                        const savedDef = constructEnv.constructDefs.get(slotName);
                        constructEnv.constructDefs.set(slotName, {instanceBuilders: slotBuilders.get(slotName), constructEnv: slotEnv});
                        this.restoreActions.push(
                            () => { 
                                constructEnv.constructDefs.set(slotName, savedDef);
                            }
                        );
                    }
                }
                for (const builder of instanceBuilders)
                    builder.call(this, subregion); 
            }
            finally { 
                this.Restore(saved);
                constructEnv.constructDefs.set(tagName, savedDef);    // Remove the circularity
             }
        }
    }

    private CompileHTMLElement(srcElm: HTMLElement) {
        // Remove trailing dots
        const nodeName = srcElm.nodeName.replace(/\.+$/, '');
        const bTrim = /^(BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|PRE|TABLE|T[RD]|UL)$/.test(nodeName)

        // We turn each given attribute into a modifier on created elements
        const arrModifiers = [] as Array<{
            modType: ModifierType,
            name: string,
            depValue: Dependent<unknown>,
            tag?: string,
        }>;

        for (const attr of srcElm.attributes) {
            const attrName = attr.name;
            let m: RegExpExecArray;
            try {
                if (m = /^on(.*)$/i.exec(attrName)) {               // Events
                    const oHandler = this.CompileExpression<Handler>(
                        `function ${attrName}(event){${attr.value}\n}`);
                    arrModifiers.push({
                        modType: /^on(create|update)$/.test(attrName) ? ModifierType.PseudoEvent : ModifierType.Event, 
                        name: CapitalizeProp(m[0]), 
                        depValue: oHandler
                    });
                }
                else if (m = /^#class:(.*)$/.exec(attrName))
                    arrModifiers.push({
                        modType: ModifierType.Class, name: m[1],
                        depValue: this.CompileExpression<boolean>(attr.value)
                    });
                else if (m = /^#style\.(.*)$/.exec(attrName))
                    arrModifiers.push({
                        modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression<unknown>(attr.value)
                    });
                else if (attrName == '+style')
                    arrModifiers.push({
                        modType: ModifierType.AddToStyle, name: null,
                        depValue: this.CompileExpression<object>(attr.value)
                    });
                else if (m = /^#(.*)/.exec(attrName))
                    arrModifiers.push({
                        modType: ModifierType.Prop, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression<unknown>(attr.value)
                    });
                else if (attrName == "+class")
                    arrModifiers.push({
                        modType: ModifierType.AddToClassList, name: null,
                        depValue: this.CompileExpression<object>(attr.value)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attrName)) { // *, **, @, @@
                    const propName = CapitalizeProp(m[3]);
                    const setter = this.CompileExpression<Handler>(
                        `function (){let ORx=this.${propName};if(${attr.value}!==ORx)${attr.value}=ORx}`);
                    arrModifiers.push(
                        m[1] == '*'
                        ? { modType: ModifierType.Event, name: null,     depValue: setter, }
                        : { modType: ModifierType.Prop,  name: propName, depValue: this.CompileExpression<unknown>(attr.value) }
                    );
                    arrModifiers.push({
                        modType: ModifierType.Event, name: m[2] ? 'onchange' : 'oninput', tag: propName, depValue: setter,
                    })
                }
                else
                    arrModifiers.push({
                        modType: ModifierType.Attr, name: attrName,
                        depValue: this.CompileInterpolatedString(attr.value)
                    });
            }
            catch (err) {
                throw(`[${attrName}]: ${err}`)
            }
        }

        if (bTrim) this.bTrimLeft = true;
        // Compile the given childnodes into a routine that builds the actual childnodes
        const childnodesBuilder = this.CompileChildNodes(srcElm, bTrim);
        if (bTrim) this.bTrimLeft = true;

        // Now the runtime action
        const builder = function ELEMENT(region: Region) {
            const {parent, start, bInit, env, lastMarker} = region;
            // Create the element
            let elm: HTMLElement;
            if (!bInit || start == srcElm) {
                region.start = start.nextSibling;
                elm = start as HTMLElement;
                if (elm.tagName != nodeName)
                    debugger;
                elm.classList.remove(...elm.classList);
            }
            else {
                elm = document.createElement(nodeName);
                parent.insertBefore(elm, start);
            }
            if (lastMarker) {
                lastMarker.nextM = elm;
                region.lastMarker = null;
            }
            
            // Add all children
            childnodesBuilder.call(this, {parent: elm, start: elm.firstChild, bInit, env, });

            // Apply all modifiers: adding attributes, classes, styles, events
            for (const mod of arrModifiers) {
                const attName = mod.name;
                try {
                    const val = mod.depValue(env);    // Evaluate the dependent value in the current environment
                    // See what to do with it
                    switch (mod.modType) {
                        case ModifierType.Attr:
                            elm.setAttribute(attName, val as string ?? ''); 
                            break;
                        case ModifierType.Prop:
                            if (val != null)
                                elm[attName] = val;
                            else
                                delete elm[attName];
                            break;
                        case ModifierType.Event:
                            elm[attName] = val; break;
                        case ModifierType.Class:
                            if (val)
                                elm.classList.add(attName);
                            break;
                        case ModifierType.Style:
                            if (val)
                                elm.style[attName] = val; 
                            else
                                delete elm.style[attName];
                            break;
                        case ModifierType.PseudoEvent:
                            if (bInit || attName == 'onupdate')
                                (val as ()=>void).call(elm); 
                            break;
                        case ModifierType.AddToStyle:
                            Object.assign(elm.style, val); break
                        case ModifierType.AddToClassList:
                            if (Array.isArray(val))
                                for (const className of val as string[])
                                    elm.classList.add(className);
                            else
                                for (const [className, bln] of Object.entries<boolean>(val as {}))
                                    if (bln)
                                        elm.classList.add(className);
                    }
                }
                catch (err) { throw `[${attName}]: ${err}`; }
            }

            if (nodeName=='SCRIPT')
                (elm as HTMLScriptElement).text = elm.textContent;
        };

        builder.bTrim = bTrim;
        return builder;
    }

    private CompileInterpolatedString(data: string, name?: string): Dependent<string> & {isBlank?: boolean} {
        const generators: Array< string | Dependent<unknown> > = [];
        const reg =
            /(?<![\\$])\$?\{(.*?)(?<!\\)\}|$/gs;
        let isBlank = true;

        while (reg.lastIndex < data.length) {
            const lastIndex = reg.lastIndex
            const m = reg.exec(data);
            const fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;

            if (fixed)
                generators.push( fixed.replace(/\\([${}\\])/g, '$1') );  // Replace '\{' etc by '{'
            if (m[1])
                generators.push( this.CompileExpression<string>(m[1], '{}', null, true) );
            if (m[1] || /[^ \t\r\n]/.test(fixed))
                isBlank = false;
        }

        const dep = (env: Environment) => {
            try {
                let result = "";
                for (const gen of generators)
                    result += 
                        ( typeof gen == 'string' ? gen : gen(env) ?? '');
                return result;
            }
            catch (err) { throw `[${name}]: ${err}`; }
        }
        dep.isBlank = isBlank;
        return dep;
    }

    private CompileAttributeExpression<T>(elm: HTMLElement, attName: string, bRequired?: boolean) {
        return this.CompileExpression<T>(GetAttribute(elm, attName, bRequired, true));
    }

    private CompileExpression<T>(
        expr: string,           // Expression to transform into a function
        delims: string = "\"\"" // Delimiters to put around the expression when encountering a compiletime or runtime error
        , bScript: boolean = false
        , bReturnErrors = false   // true: yield errormessage als result. <T> has to be <string>.
        , name?: string
    ): Dependent<T> {
        if (expr == null) return null;
        let depExpr = 
            bScript 
            ?  `([${this.Context.join(',')}]) => {'use strict';${expr}\n}`  // Braces
            :  `([${this.Context.join(',')}]) => (${expr}\n)`;              // Parentheses
        const errorInfo = `${name ? `[${name}] ` : ''}${delims[0]}${Abbreviate(expr,60)}${delims[1]}: `;

        try {
            const routine = globalEval(depExpr) as (env:Environment) => T;
            return (env: Environment) => {
                try {
                    return routine(env);
                } 
                catch (err) { 
                    const message = `${errorInfo}${err}`;
                    if (bReturnErrors && !this.Settings.bAbortOnError) {
                        console.log(message);
                        return (this.Settings.bShowErrors ? message : "") as unknown as T;
                    }
                    else
                        throw message;
                }   // Runtime error
            }
        }
        catch (err) { throw `${errorInfo}${err}`; }             // Compiletime error
    }
}
/*
    start['endNode'] is defined, en is gelijk aan end: de regio is al eerder voorbereid.
        start is dan het al eerder ingevoegde Comment, en moet overgeslagen worden.
    
    Anders moet de regio voorbereid worden door een start- en eind-Comment in te voegen.
    Het start-comment is nodig als vaste markering als de inhoud verandert.
    Het eindcomment is soms nodig opdat de inhoud een vast eindpunt heeft.

    Het kan zijn dat het bron-element er nog staat; dat is dan gelijk aan start.
        De start-markering moet dan geplaatst worden vóór dit bron-element, en de eind-markering er direct ná
    Anders worden zowel start- als eindmarkering vóór 'start' geplaatst.
*/
function PrepareRegion(srcElm: HTMLElement, region: Region, result: unknown = null, bForcedClear: boolean = false, name?: string)
    : Region & {marker: Comment}
{
    let {parent, start, bInit, lastMarker} = region;
    let marker: Marker & Comment;
    if (bInit) {
        marker = region.lastMarker = parent.insertBefore(document.createComment(name || srcElm.tagName), start);
        if (lastMarker)
            lastMarker.nextM = marker;
        
        if (start && start == srcElm)
            region.start = start = start.nextSibling;
    }
    else {
        marker = start as Comment;
        region.start = marker.nextM;
        start = marker.nextSibling;
    }

    if (bInit ||= (bForcedClear || (result != marker.rResult ?? null)) ) {
        marker.rResult = result;
        while (start != region.start) {
            const next = start.nextSibling;
            parent.removeChild(start);
            start = next;
        }
    }
    return {parent, marker, start, bInit, env: region.env};
}

interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
class _RVAR<T>{
    constructor(
        private rRuntime: RCompiler,
        private name?: string, 
        initialValue?: T, 
        private store?: Store,
        private storeName?: string,
    ) {
        if (name) {
            //if (name in globalThis) window.alert(`new RVAR('${name}'): '${name}' already exists.`);
            globalThis[name] = this;
        }
        let s: string;
        if ((s = store?.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch{}
        this._Value = initialValue;
    }
    // The value of the variable
    private _Value: T;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    Subscribers: Set<Subscriber> = new Set();

    Subscribe(s: Subscriber) {
        this.Subscribers.add(s);
    }

    // Use var.V to get or set its value
    get V() { return this._Value; }
    // When setting, it will be marked dirty.
    set V(t: T) {
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
            this.store?.setItem(`RVAR_${this.storeName}`, JSON.stringify(t));
        }
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { this.SetDirty();  return this._Value; }
    set U(t: T) { this.V = t; }

    SetDirty() {
        for (const sub of this.Subscribers)
            if (sub.parent.isConnected)
                this.rRuntime.DirtyRegions.add(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.bSomethingDirty = true;
        this.rRuntime.RUpdate();
    }
}

// Capitalization of property names
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
const words = 'align|animation|aria|background|border|bottom|bounding|child|class|client|column|content|element|first|font|get|image|inner|is|last|left|node|offset|outer|owner|parent|right|rule|scroll|tab|text|top|value';
const regCapitalize = new RegExp(`^(.*(${words}))([a-z])(.*)$`);
function CapitalizeProp(lcName: string) {
    let m: RegExpExecArray;
    lcName = lcName.replace(/html|uri/g, s => s.toUpperCase());
    while(m = regCapitalize.exec(lcName))
        lcName = `${m[1]}${m[3].toUpperCase()}${m[4]}`;
    return lcName;
}

function GetAttribute(elm: HTMLElement, name: string, bRequired?: boolean, bHashAllowed?: boolean) {
    let value = elm.getAttribute(name);
    if (value==null && bHashAllowed) {
        name = `#${name}`;
        value = elm.getAttribute(name);
    }
    if (value == null && bRequired)
        throw `Missing attribute [${name}]`;
    return value;
}
function RequiredChildElement(elm: HTMLElement, name: string) {
    const result = OptionalChildElement(elm, name);
    if (!result)
        throw `Missing child element <${name}>`;
    return result;
}
function OptionalChildElement(elm: HTMLElement, name: string) {
    let child = elm.firstElementChild as HTMLElement;
    let result: HTMLElement = null;
    while (child) {
        if (name=='*' || child.tagName==name) {
            if (result)
                throw `Multiple child elements <${name}>`;
            result = child;
        }
        child = child.nextElementSibling as HTMLElement;
    }
    return result;
}

function OuterOpenTag(elm: HTMLElement, maxLength?: number): string {
    return Abbreviate(/<.*?(?=>)/.exec(elm.outerHTML)[0], maxLength-1) + '>';
}
function Abbreviate(s: string, maxLength: number) {
    if (maxLength && s.length > maxLength)
        return s.substr(0, maxLength - 3) + "...";
    return s;
}

function CBool(s: string|boolean, valOnEmpty?: boolean): boolean {
    if (typeof s == 'string')
        switch (s.toLowerCase()) {
            case "yes":
            case "true":
                return true;
            case "no":
            case "false":
                return false;
            case "":
                return valOnEmpty;
            default:
                return null;
        }
    return s;
}

function thrower(err: string): never { throw err; }

export let RHTML = new RCompiler();
export const 
    RVAR = RHTML.RVAR, 
    RUpdate = RHTML.RUpdate;

Object.defineProperties(
    globalThis,
    {
        RVAR:       {get: () => RHTML.RVAR},
        RUpdate:    {get: () => RHTML.RUpdate},
    }
);
globalThis.RCompile = RCompile;

export function* range(from: number, upto?: number, step: number = 1) {
	if (upto === undefined) {
		upto = from;
		from = 0;
	}
	for (let i= from; i<upto; i += step)
		yield i;
}
globalThis.range = range;