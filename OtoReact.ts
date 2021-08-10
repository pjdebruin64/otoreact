// Global settings
const defaultSettings = {
    bAbortOnError:  false,  // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    true,   // Show runtime errors as text in the DOM output
    bStripSpaces:   true,   // To do
    bRunScripts:    false,
    bBuild:         true,
    rootPattern:    null as string,
}
type FullSettings = typeof defaultSettings
type Settings = { [Property in keyof FullSettings]+?: FullSettings[Property] };
let RootPath: string = null;

export function RCompile(elm: HTMLElement, settings?: Settings) {    
    try {
        let {rootPattern} = settings;
        if (rootPattern) {
            const url = document.location.href;
            const m = url.match(`^.*(${rootPattern})`);
            if (!m)
                throw `Root pattern '${rootPattern}' does not match URL '${url}'`;
            globalThis.RootPath = RootPath = (new URL(m[0])).pathname;
        }
        SetDocLocation();


        const R = RHTML;
        R.Compile(elm, {...defaultSettings, ...settings});
        R.ToBuild.push({parent: elm, start: elm.firstChild, bInit: true, env: NewEnv(), });

        if (R.Settings.bBuild)
            R.DoUpdate()
            .then(() => elm.hidden = false);
        
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
type ElmBuilder = ((this: RCompiler, reg: Region) => Promise<void>) & {bTrim?: boolean};
type ParentNode = HTMLElement|DocumentFragment;
//type FragmentCompiler = (srcParent: ParentNode, srcElm: HTMLElement) => ElmBuilder

type Subscriber = {parent: Element, marker: ChildNode, env: Environment, builder: ElmBuilder };

type Handler = (ev:Event) => any;
type LVar = (env: Environment) => (value: unknown) => void;

interface Item {};  // Three unknown but distinct types
interface Key {};
interface Hash {};

type Parameter = {name: string, pDefault: Dependent<unknown>, initVar?: LVar};
class Signature {
    constructor(
        public TagName: string,
    ){ }
    public Parameters: Array<Parameter> = [];
    public RestParam: Parameter = null;
    public Slots = new Map<string, Signature>();

    Equals(sig: Signature): boolean {
        let result =
            sig
            && this.TagName == sig.TagName
            && this.Parameters.length == sig.Parameters.length
            && this.Slots.size == sig.Slots.size;
        
        for (let i=0;i<this.Parameters.length;i++)
            result &&= this.Parameters[i].name == sig.Parameters[i].name;
        result &&= this.RestParam?.name == sig.RestParam?.name;

        for (let [slotname, slotSig] of this.Slots)
            result &&= slotSig.Equals(sig.Slots.get(slotname));
        
        return result;
    }
}

type RVAR_Light<T> = T & {
    _Subscribers?: Array<Subscriber>,
    _UpdatesTo?: Array<_RVAR<unknown>>,
    Subscribe?: (sub:Subscriber) => void
};

const globalEval = eval, globalFetch = fetch;

enum ModifierType {Attr, Prop, Class, Style, Event, PseudoEvent, AddToStyle, AddToClassList, RestArgument};
type Modifier = {
    modType: ModifierType,
    name: string,
    depValue: Dependent<unknown>,
    tag?: string,
}
type RestParameter = Array<{modType: ModifierType, name: string, value: unknown}>;

function ApplyModifier(elm: HTMLElement, modType: ModifierType, name: string, val: unknown) {    
    switch (modType) {
        case ModifierType.Attr:
            elm.setAttribute(name, val as string ?? ''); 
            break;
        case ModifierType.Prop:
            if (val != null)
                elm[name] = val;
            else
                delete elm[name];
            break;
        case ModifierType.Event:
            elm[name] = val; break;
        case ModifierType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModifierType.Style:
            if (val !== undefined)
                elm.style[name] = val ?? '';
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
            break;
        case ModifierType.RestArgument:
            for (const {modType, name, value} of val as RestParameter)
                ApplyModifier(elm, modType, name, value);
            break;
    }
}

const envActions: Array<() => void> = [];
type SavedEnv = number;
function SaveEnv(): SavedEnv {
    return envActions.length;
}
function RestoreEnv(savedEnv: SavedEnv) {
    for (let j=envActions.length; j>savedEnv; j--)
        envActions.pop()();
}

let num=0;
class RCompiler {
    instanceNum = num++;
    private Context: Context;
    private ContextMap: Map<string, number>;

    private Constructs: Map<string, Signature>;

    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(clone?: RCompiler) { 
        this.Context    = clone ? clone.Context.slice() : [];
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings   = clone ? {...clone.Settings} : undefined;
    }

    private restoreActions: Array<() => void> = [];

    private SaveContext(): SavedContext {
        return this.restoreActions.length;
    }
    private RestoreContext(savedContext: SavedContext) {
        for (let j=this.restoreActions.length; j>savedContext; j--)
            this.restoreActions.pop()();
    }

    private NewVar(name: string): LVar {
        if (!name)
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
            return (_) => (_) => {};
       
        CheckValidIdentifier(name);

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
            envActions.push( () => {env[i] = prev;} );
            
            return function SetVar(value: unknown) {
                env[i] = value;
            }
        }.bind(this) as LVar            
    }

    private AddConstruct(C: Signature) {
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
        this.Builder = this.CompileChildNodes(elm);
        this.bCompiled = true;
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
    }

    public async Build(reg: Region & {marker?: ChildNode}) {
        const savedRCompiler = RHTML;
        RHTML = this;
        await this.Builder(reg);
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
    RUpdate() {
        //clearTimeout(this.handleUpdate);
        if (!this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 0);
    };

    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        
        this.bUpdating = true;
        let savedRCompiler = RHTML;
        try {
            if (this.ToBuild.length) {
                const t0 = Date.now();
                this.builtNodeCount = 0;
                for (const reg of this.ToBuild)
                    await this.Build(reg);
                console.log(`Built ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
                this.ToBuild = [];
            }

            if (!this.bHasReacts && this.bSomethingDirty)
                for (const s of this.AllRegions)
                    this.DirtyRegions.add(s);
            
            if (this.DirtyRegions.size) {
                RHTML = this;
                const t0 = Date.now();
                this.builtNodeCount = 0;
                this.bSomethingDirty = false;
                for (const {parent, marker, builder, env} of this.DirtyRegions) {
                    try { 
                        await builder.call(this, {parent, start: marker ? marker.nextSibling : parent.firstChild, env, }); 
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
    RVAR<T>(
        name?: string, 
        initialValue?: T, 
        store?: Store
    ) {
        return new _RVAR<T>(this, name, initialValue, store, name);
    }; // as <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>;
    
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
        const saved = this.SaveContext();
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
                        async function Text(region: Region) {
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

        this.RestoreContext(saved);

        return async function ChildNodes(region) {
                const savedEnv = SaveEnv();
                try {
                    for (const [builder, node] of builders)
                        await this.CallWithErrorHandling(builder, node, region);
                    this.builtNodeCount += builders.length;
                }
                finally {
                    RestoreEnv(savedEnv);
                }
            };
    }

    private CompileElement(srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel?: boolean): [ElmBuilder, ChildNode][] {
        let builder: ElmBuilder = null;
        const reactOn = GetAttribute(srcElm, 'reacton') || GetAttribute(srcElm, 'reactson');
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
                        const getValue = this.CompileAttribute(srcElm, 'value');
                        const getStore = rvarName && this.CompileAttributeExpression<Store>(srcElm, 'store');
                        const newVar = this.NewVar(varName);
                        const bReact = GetAttribute(srcElm, 'react') != null;

                        builder = async function DEFINE(this: RCompiler, region) {
                                const {marker} = PrepareRegion(srcElm, region, undefined, undefined, varName);
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
                        const bHiding = CBool(srcElm.getAttribute('hiding'));
                        const caseList: Array<{condition: Dependent<boolean>, regex: RegExp, builder: ElmBuilder, child: HTMLElement}> = [];
                        const getCondition = (srcElm.nodeName == 'IF') && this.CompileAttributeExpression<boolean>(srcElm, 'cond', true);
                        const getValue = this.CompileAttributeExpression<string>(srcElm, 'value');
                        const bodyNodes: ChildNode[] = [];
                        const bTrimLeft = this.bTrimLeft;
                        for (const child of srcElm.childNodes) {
                            if (child.nodeType == Node.ELEMENT_NODE) {
                                const childElm = child as HTMLElement
                                this.bTrimLeft = bTrimLeft;
                                switch (child.nodeName) {
                                    case 'WHEN':
                                        const regMatch = childElm.getAttribute('regmatch');
                                        const regex = regMatch ? new RegExp(regMatch, 'i') : null
                                        const cond = this.CompileAttributeExpression<boolean>(childElm, 'cond', regMatch == null);
                                        caseList.push({
                                            condition: cond
                                            , regex
                                            , builder: this.CompileChildNodes(childElm, bBlockLevel)
                                            , child: childElm
                                        });
                                        continue;
                                    case 'ELSE':
                                        caseList.push({
                                            condition: (_env) => true
                                            , regex: null
                                            , builder: this.CompileChildNodes(childElm, bBlockLevel)
                                            , child: childElm
                                        });
                                        continue;
                                }
                            }
                            bodyNodes.push(child);
                        }
                        if (getCondition)
                            caseList.unshift({
                                condition: getCondition, regex: null,
                                builder: this.CompileChildNodes(srcElm, bBlockLevel, bodyNodes),
                                child: srcElm
                            });

                        builder = 
                            async function CASE(region) {
                                const value = getValue && getValue(region.env);
                                let result: typeof caseList[0] = null;
                                for (const alt of caseList)
                                    try {
                                        if (
                                            (!alt.condition || alt.condition(region.env)) 
                                            && (!alt.regex || alt.regex.test(value)))
                                        { result = alt; break; }
                                    } catch (err) { throw `${OuterOpenTag(alt.child)}${err}`; }
                                if (bHiding) {
                                    // In this CASE variant, all subtrees are kept in place, some are hidden
                                    let {start, bInit, env} = PrepareRegion(srcElm, region, null, region.bInit);
                                        
                                    for (const alt of caseList) {
                                        const bHidden = alt != result;
                                        let elm: HTMLElement;
                                        if (!bInit || start == srcElm) {
                                            elm = start as HTMLElement;
                                            start = start.nextSibling;
                                        }
                                        else
                                            region.parent.insertBefore(
                                                elm = document.createElement(alt.child.nodeName),
                                                start);
                                        elm.hidden = bHidden;
                                        if (!bHidden || bInit)
                                            await this.CallWithErrorHandling(alt.builder, alt.child, {parent: elm, start: elm.firstChild, bInit, env} );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    const subregion = PrepareRegion(srcElm, region, result);
                                    if (result)
                                        await this.CallWithErrorHandling(result.builder, result.child, subregion );
                                        //await result.call(this, subregion);
                                }
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
                        
                        const task = (async () => {
                            const response = await globalFetch(src);
                            //if (response.status != 200)

                            const textContent = await response.text();
                            // Parse the contents of the file
                            const parser = new DOMParser();
                            const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;

                            // Compile the parsed contents of the file in the original context
                            C.Compile(parsedContent.body, this.Settings, );
                            this.bHasReacts ||= C.bHasReacts;
                        })();

                        builder = 
                            // Runtime routine
                            async function INCLUDE(region) {
                                const subregion = PrepareRegion(srcElm, region);

                                await task;
                                await C.Builder(subregion);
                            };
                    } break;

                    case 'IMPORT': {
                        const src = GetAttribute(srcElm, 'src', true);
                        const mapComponents = new Map<string, [Signature, ElmBuilder[], RCompiler]>();
                        
                        for (const child of srcElm.children) {
                            const signature = this.ParseSignature(child);
                            async function holdOn(this: RCompiler, region: Region) {
                                await task;
                                await builders[0].call(this, region);
                            }
                            const builders:Array<ElmBuilder> = [holdOn];

                            mapComponents.set(child.tagName, [signature, builders, new RCompiler(this)]);
                            
                            this.AddConstruct(signature);
                        }
                        
                        const task =
                            (async () => {
                                const response = await globalFetch(src);
                                const textContent = await response.text();
                                // Parse the contents of the file
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;
                                for (const libElm of parsedContent.body.children as Iterable<HTMLElement>)
                                    if (libElm.tagName=='COMPONENT') {
                                        const triple = mapComponents.get(libElm.firstElementChild.tagName);
                                        if (triple){
                                            const [clientSig, instanceBuilders, compiler] = triple;
                                            compiler.Settings.bRunScripts = true;
                                            const {signature, elmTemplate, builders} = compiler.AnalyseComponent(libElm);
                                            if (!clientSig.Equals(signature))
                                                throw `Imported signature <${clientSig.TagName}> is unequal to library signature <${signature.TagName}>`;
                                            const instanceBuilder = compiler.CompileConstructTemplate(clientSig, elmTemplate.content, elmTemplate, false);
                                            this.bHasReacts ||= compiler.bHasReacts;
                                            instanceBuilders.length = 0;
                                            instanceBuilders.push(...builders.map((b)=>b[0]), instanceBuilder)
                                            triple[2] = undefined;
                                        }
                                    }
                                for (const [tagName, triple] of mapComponents.entries())
                                    if (triple[2])
                                        throw `Component ${tagName} is missing in '${src}'`;
                            })();
                        
                        srcParent.removeChild(srcElm);

                        builder = async function IMPORT({env}: Region) {
                            const constructEnv = CloneEnv(env);
                            for (const [{TagName}, instanceBuilders] of mapComponents.values()) {
                                const prevDef = env.constructDefs.get(TagName);
                                const constructDef = {instanceBuilders, constructEnv};
                                env.constructDefs.set(TagName, constructDef);
                                constructEnv.constructDefs.set(TagName, constructDef);  // Circular reference
                                envActions.push(
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
                        
                        builder = async function REACT(region) {
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
        
                            await bodyBuilder.call(this, subregion);
                        }
                    } break;

                    case 'RHTML': {
                        const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                        srcParent.removeChild(srcElm);

                        builder = async function RHTML(region) {
                            const tempElm = document.createElement('RHTML');
                            await bodyBuilder.call(this, {parent: tempElm, start: null, env: region.env, bInit: true});
                            const result = tempElm.innerText

                            const subregion = PrepareRegion(srcElm, region, result);

                            if (subregion.bInit) {
                                tempElm.innerHTML = result;

                                const R = new RCompiler();
                                subregion.env = NewEnv();

                                R.Compile(tempElm, {bRunScripts: true });
                                await R.Build(subregion);
                            }
                        };                                
                    } break;

                    case 'SCRIPT': 
                        builder = this.CompileScript(srcParent, srcElm as HTMLScriptElement); break;

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
            builder = async function REACT(region) {
                let {parent, marker} = PrepareRegion(srcElm, region, null, null, 'reacton');

                await bodyBuilder.call(this, region);

                if (region.bInit) {
                    const subscriber: Subscriber = {
                        parent, marker,
                        builder: async function reacton(reg: Region) {
                            await this.CallWithErrorHandling(bodyBuilder, srcElm, reg);
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

    private async CallWithErrorHandling(this: RCompiler, builder: ElmBuilder, srcNode: ChildNode, region: Region){
        let start = region.start;
        if (start?.errorNode) {
            region.parent.removeChild(start.errorNode);
            start.errorNode = undefined;
        }
        try {
            //await builder(region);
            await builder.call(this, region);
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

    private CompileScript(this:RCompiler, srcParent: ParentNode, srcElm: HTMLScriptElement) {
        srcParent.removeChild(srcElm);
        if ( srcElm.noModule || this.Settings.bRunScripts) {
            let script = srcElm.text;
            const defines = GetAttribute(srcElm, 'defines');
            if (defines) {
                for (let name of defines.split(',')) {
                    name = name.trim();
                    CheckValidIdentifier(name);
                    script += `globalThis.${name} = ${name};\n`
                }
            }
            globalEval(`'use strict';${script}\n`);
            /*
            let elm = document.createElement('script') as HTMLScriptElement;
            elm.type = srcElm.type;
            if (srcElm.src)
                elm.src = srcElm.src;
            else
                elm.text = `'use strict';${script}\n`;
            document.head.appendChild(elm);
            */
        }
        return null;
    }

    private CompileStyle(srcParent: ParentNode, srcElm: HTMLElement): ElmBuilder {
        srcParent.removeChild(srcElm);
        document.head.appendChild(srcElm);
        return null;
    }

    public CompileForeach(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel: boolean): ElmBuilder {
        const varName = GetAttribute(srcElm, 'let');
        let indexName = srcElm.getAttribute('index');
        if (indexName == '') indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) { /* A regular iteration */
                const getRange = this.CompileAttributeExpression<Iterable<Item>>(srcElm, 'of', true);
                let prevName = srcElm.getAttribute('previous');
                if (prevName == '') prevName = 'previous';

                const bReactive = CBool(srcElm.getAttribute('updateable') ?? srcElm.getAttribute('reactive'), true);
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
                return async function FOREACH(this: RCompiler, region: Region) {
                    let subregion = PrepareRegion(srcElm, region, null, (getKey == null));
                    let {parent, marker, start, env} = subregion;
                    const savedEnv = SaveEnv();
                    try {
                        // Map of previous data, if any
                        const keyMap: Map<Key, Subscriber>
                            = (region.bInit ? marker.keyMap = new Map() : marker.keyMap);
                        // Map of the newly obtained data
                        const newMap: Map<Key, {item:Item, hash:Hash}> = new Map();
                        const setVar = initVar(env);
                        const iterator = getRange(env);
                        if (!iterator || typeof iterator[Symbol.iterator] != 'function')
                            throw `[of]: Value (${iterator}) is not iterable`;
                        for (const item of iterator) {
                            setVar(item);
                            const hash = getHash && getHash(env);
                            const key = getKey ? getKey(env) : hash;
                            newMap.set(key ?? {}, {item, hash});
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
                        for (const [key, {item, hash}] of newMap) {
                            // Environment instellen
                            let rvar: Item =
                                ( getUpdatesTo ? this.RVAR_Light(item as object, [getUpdatesTo(env)])
                                : bReactive ? this.RVAR_Light(item as object)
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
                                    builder: (bReactive ? bodyBuilder : undefined),
                                    env: (bReactive ? CloneEnv(env) : undefined), 
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
                                await bodyBuilder.call(this, childRegion);

                            if (bReactive)
                                (rvar as _RVAR<Item>).Subscribe(subscriber);

                            prevItem = item;
                            index++;
                            
                            start = subregion.start;
                            RemoveStaleItemsHere();
                        }
                    }
                    finally { RestoreEnv(savedEnv); }
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

                return async function FOREACH_Slot(this: RCompiler, region: Region) {
                    const subregion = PrepareRegion(srcElm, region);
                    const env = subregion.env;
                    const saved= SaveEnv();
                    const slotDef = env.constructDefs.get(slotName);
                    try {
                        const setIndex = initIndex(region.env);
                        let index = 0;
                        for (const slotBuilder of slotDef.instanceBuilders) {
                            setIndex(index++);
                            env.constructDefs.set(slotName, {instanceBuilders: [slotBuilder], constructEnv: slotDef.constructEnv});
                            await bodyBuilder.call(this, subregion);
                        }
                    }
                    finally {
                        env.constructDefs.set(slotName, slotDef);
                        RestoreEnv(saved);
                    }
                }
            }
        }
        finally { this.RestoreContext(saved); }
    }

    private ParseSignature(elmSignature: Element):  Signature {
        const signature = new Signature(elmSignature.tagName);
        for (const attr of elmSignature.attributes) {
            if (signature.RestParam) 
                throw `Rest parameter must be the last`;
            const m = /^(#|\.\.\.)?(.*?)(\?)?$/.exec(attr.name);
            if (m[1] == '...')
                signature.RestParam = {name: m[2], pDefault: undefined};
            else
                signature.Parameters.push(
                    { name: m[2]
                    , pDefault: 
                        attr.value != '' 
                        ? (m[1] == '#' ? this.CompileExpression(attr.value) :  this.CompileInterpolatedString(attr.value))
                        : m[3] ? (_) => undefined
                        : null 
                    }
                );
            }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.tagName, this.ParseSignature(elmSlot));
        return signature;
    }

    private CompileComponent(srcParent: ParentNode, srcElm: HTMLElement): [ElmBuilder, ChildNode][] {
        srcParent.removeChild(srcElm);

        const {signature, elmTemplate, builders} = this.AnalyseComponent(srcElm);
        const tagName = signature.TagName;

        this.AddConstruct(signature);
        
        // Deze builder bouwt de component-instances op
        const instanceBuilders = [
            this.CompileConstructTemplate(signature, elmTemplate.content, elmTemplate, false)
        ];

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        builders.push([ 
            async function COMPONENT({env}: Region) {
                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs
                const construct = {instanceBuilders, constructEnv: undefined as Environment};
                const prevDef = env.constructDefs.get(tagName);
                env.constructDefs.set(tagName, construct);
                construct.constructEnv = CloneEnv(env);     // Contains circular reference to construct
                envActions.push(
                    () => { env.constructDefs.set(tagName,  prevDef); }
                );
            }, srcElm ]);
        
        return builders;
    }

    private AnalyseComponent(srcElm: HTMLElement) {

        const builders: [ElmBuilder, ChildNode][] = [];
        let signature: Signature, elmTemplate: HTMLTemplateElement;

        for (const srcChild of Array.from(srcElm.children) as Iterable<HTMLElement>)
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    const builder = this.CompileScript(srcElm, srcChild as HTMLScriptElement);
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
                    if (signature) throw 'Double signature';
                    signature = this.ParseSignature(srcChild);
                    break;
            }
        if (!signature) throw `Missing signature`;
        if (!elmTemplate) throw 'Missing <TEMPLATE>';

        return {signature, elmTemplate, builders};
    }

    private CompileConstructTemplate(construct: Signature, contentNode: ParentNode, srcElm: HTMLElement, bNewNames: boolean): ElmBuilder {
        const saved = this.SaveContext();
        for (const param of construct.Parameters)
            param.initVar = this.NewVar(bNewNames && GetAttribute(srcElm, param.name, true) || param.name);
        const restParam = construct.RestParam;
        if (restParam )
            restParam.initVar = this.NewVar(bNewNames && GetAttribute(srcElm, `...${restParam.name}`, true) || restParam.name);
        
        for (const S of construct.Slots.values())
            this.AddConstruct(S);
        try {
            return this.CompileChildNodes(contentNode);
        }
        catch (err) {throw `${OuterOpenTag(srcElm)} ${err}`;}
        finally { this.RestoreContext(saved); }
    }

    private CompileConstructInstance(
        srcParent: ParentNode, srcElm: HTMLElement,
        signature: Signature
    ) {
        srcParent.removeChild(srcElm);
        const tagName = signature.TagName;
        const {preModifiers} = this.CompileAttributes(srcElm);
        const computeParameters: Array<Dependent<unknown>> = [];

        for (const {name, pDefault} of signature.Parameters) {
            let pValue: Dependent<unknown> = null;
            getP: {
                let i = 0;
                for (const P of preModifiers) {
                    if (P.name == name) {
                        preModifiers.splice(i, 1);
                        switch(P.modType) {
                            case ModifierType.Attr:
                            case ModifierType.Prop:
                            case ModifierType.Event:
                                pValue = P.depValue; break getP;
                            default:
                                throw `Invalid argument ${srcElm.attributes.item(i).name}`;
                        }
                    }
                    i++;
                }
                if (!pDefault)
                    throw `Missing argument [${name}]`;
                pValue = pDefault;
            }
            computeParameters.push(pValue);
        }

        const slotBuilders = new Map<string, ElmBuilder[]>();
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);

        let slotElm: HTMLElement, Slot: Signature;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE 
                && (Slot = signature.Slots.get(
                    (slotElm = (node as HTMLElement)).tagName
                    ))
            ) {
                slotBuilders.get(slotElm.tagName).push(
                    this.CompileConstructTemplate(Slot, slotElm, slotElm, true)
                );
                srcElm.removeChild(node);
            }
        
        const contentSlot = signature.Slots.get('CONTENT');
        if (contentSlot)
            slotBuilders.get('CONTENT').push(
                this.CompileConstructTemplate(contentSlot, srcElm, srcElm, true)
            );
        this.bTrimLeft = false;

        return async function INSTANCE(this: RCompiler, region: Region) {
            const subregion = PrepareRegion(srcElm, region);
            const localEnv = subregion.env;

            // The construct-template(s) will be executed in this construct-env
            const {instanceBuilders, constructEnv} =  localEnv.constructDefs.get(tagName);

            const savedEnv = SaveEnv();
            try {
                // Add the parameter values to the construct-env
                let i = 0;
                for ( const param of signature.Parameters) {
                    param.initVar(constructEnv)(computeParameters[i](localEnv));
                    i++;
                }
                if (signature.RestParam) {
                    const rest: RestParameter = [];
                    for (const {modType, name, depValue} of preModifiers)
                        rest.push({modType, name, value: depValue(localEnv)})
                    
                    signature.RestParam.initVar(constructEnv)(rest);
                }

                if (signature.Slots.size) {
                    // The instance-builders of the slots are to be installed
                    const slotEnv = CloneEnv(localEnv);
                    for (const slotName of signature.Slots.keys()) {
                        const savedDef = constructEnv.constructDefs.get(slotName);
                        constructEnv.constructDefs.set(slotName, {instanceBuilders: slotBuilders.get(slotName), constructEnv: slotEnv});
                        envActions.push(
                            () => { 
                                constructEnv.constructDefs.set(slotName, savedDef);
                            }
                        );
                    }
                }

                subregion.env = constructEnv
                for (const builder of instanceBuilders)
                    await builder.call(this, subregion); 
            }
            finally { 
                RestoreEnv(savedEnv);
             }
        }
    }

    private CompileHTMLElement(srcElm: HTMLElement) {
        // Remove trailing dots
        const nodeName = srcElm.nodeName.replace(/\.+$/, '');
        const bTrim = /^(BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL)$/.test(nodeName)

        // We turn each given attribute into a modifier on created elements
        const {preModifiers, postModifiers} = this.CompileAttributes(srcElm);

        if (bTrim) this.bTrimLeft = true;
        // Compile the given childnodes into a routine that builds the actual childnodes
        const childnodesBuilder = this.CompileChildNodes(srcElm, bTrim);
        if (bTrim) this.bTrimLeft = true;

        // Now the runtime action
        const builder = async function ELEMENT(region: Region) {
            const {parent, start, bInit, env, lastMarker} = region;
            // Create the element
            let elm: HTMLElement;
            if (!bInit || start == srcElm) {
                region.start = start.nextSibling;
                elm = start as HTMLElement;
                if (elm.tagName != nodeName) {
                    (elm = document.createElement(nodeName)).append(...start.childNodes);
                    parent.replaceChild(elm, start);
                }
                else
                    elm.removeAttribute('class');
            }
            else
                parent.insertBefore(elm = document.createElement(nodeName), start);
            
            if (lastMarker) {
                lastMarker.nextM = elm;
                region.lastMarker = null;
            }

            // Apply all modifiers: adding attributes, classes, styles, events
            for (const {modType, name, depValue} of preModifiers) {
                try {
                    const value = depValue(env);    // Evaluate the dependent value in the current environment
                    // See what to do with it
                    ApplyModifier(elm, modType, name, value)
                }
                catch (err) { throw `[${name}]: ${err}`; }
            }
            
            // Add all children
            await childnodesBuilder.call(this, {parent: elm, start: elm.firstChild, bInit, env, });

            // Apply all modifiers: adding attributes, classes, styles, events
            for (const mod of postModifiers) {
                const attName = mod.name;
                try {
                    const val = mod.depValue(env);    // Evaluate the dependent value in the current environment
                    // See what to do with it
                    switch (mod.modType) {
                        case ModifierType.PseudoEvent:
                            if (bInit || attName == 'onupdate')
                                (val as ()=>void).call(elm); 
                            break;
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

    private CompileAttributes(srcElm: HTMLElement) { 
        const preModifiers: Array<Modifier> = [], postModifiers: Array<Modifier> = [];

        for (const attr of srcElm.attributes) {
            const attrName = attr.name;
            let m: RegExpExecArray;
            try {
                if (m = /^on(create|update)$/i.exec(attrName))
                    postModifiers.push({
                        modType: ModifierType.PseudoEvent, 
                        name: m[0], 
                        depValue: this.CompileExpression<Handler>(
                            `function ${attrName}(){${attr.value}\n}`)
                    });
                else if (m = /^on(.*)$/i.exec(attrName))               // Events
                    preModifiers.push({
                        modType: ModifierType.Event, 
                        name: CapitalizeProp(m[0]), 
                        depValue: this.CompileExpression<Handler>(
                            `function ${attrName}(event){${attr.value}\n}`)
                    });
                else if (m = /^#class:(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Class, name: m[1],
                        depValue: this.CompileExpression<boolean>(attr.value)
                    });
                else if (m = /^#style\.(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression<unknown>(attr.value)
                    });
                else if (m = /^style\.(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompileInterpolatedString(attr.value)
                    });
                else if (attrName == '+style')
                    preModifiers.push({
                        modType: ModifierType.AddToStyle, name: null,
                        depValue: this.CompileExpression<object>(attr.value)
                    });
                else if (m = /^#(.*)/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Prop, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression<unknown>(attr.value)
                    });
                else if (attrName == "+class")
                    preModifiers.push({
                        modType: ModifierType.AddToClassList, name: null,
                        depValue: this.CompileExpression<object>(attr.value)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attrName)) { // *, **, @, @@
                    const propName = CapitalizeProp(m[3]);
                    const setter = this.CompileExpression<Handler>(
                        `function (){const ORx=this.${propName};if(${attr.value}!==ORx)${attr.value}=ORx}`);
                    preModifiers.push(
                        m[1] == '*'
                        ? { modType: ModifierType.Event, name: null,     depValue: setter, }
                        : { modType: ModifierType.Prop,  name: propName, depValue: this.CompileExpression<unknown>(attr.value) }
                    );
                    preModifiers.push({
                        modType: ModifierType.Event, name: m[2] ? 'onchange' : 'oninput', tag: propName, depValue: setter,
                    })
                }
                else if (m = /^\.\.\.(.*)/.exec(attrName)) {
                    if (attr.value) throw `Rest parameter cannot have a value`;
                    preModifiers.push({
                        modType: ModifierType.RestArgument, name: null,
                        depValue: this.CompileName(m[1])
                    });
                }
                else
                    preModifiers.push({
                        modType: ModifierType.Attr, name: attrName,
                        depValue: this.CompileInterpolatedString(attr.value)
                    });
            }
            catch (err) {
                throw(`[${attrName}]: ${err}`)
            }
        }
        return {preModifiers, postModifiers};
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
    private CompileAttribute(elm: HTMLElement, attName: string, bRequired?: boolean): Dependent<unknown> {
        const value = elm.getAttribute(attName);
        if (value != null)
            return this.CompileInterpolatedString(value);
        return this.CompileAttributeExpression(elm, `#${attName}`, bRequired);
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
    private CompileName(name: string): Dependent<unknown> {
        const i = this.ContextMap.get(name);
        if (i === undefined) throw `Unknown name '${name}'`;
        return env => env[i];
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
function PrepareRegion(srcElm: HTMLElement, region: Region, result: unknown = null, bForcedClear: boolean = false, text?: string)
    : Region & {marker: Comment}
{
    let {parent, start, bInit, lastMarker} = region;
    let marker: Marker & Comment;
    if (bInit) {
        marker = region.lastMarker = parent.insertBefore(document.createComment(text ? `${srcElm?.tagName} ${text}`: srcElm.tagName), start);
        if (lastMarker)
            lastMarker.nextM = marker;
        
        if (start && start == srcElm)
            region.start = start.nextSibling;
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
        if (name) globalThis[name] = this;
        
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

function CheckValidIdentifier(name: string) {
    // Anders moet het een geldige JavaScript identifier zijn
    if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(name) )
        throw `Invalid identifier '${name}'`;
    if (/^(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/.test(name))
        throw `Reserved keyword '${name}'`
}

// Capitalization of property names
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
const words = '(align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
+ '|clip|column|content|element|feature|fill|first|font|get|grid|image|inner|is|last|left|margin|max|min|node|offset|outer'
+ '|outline|overflow|owner|padding|parent|right|size|rule|scroll|table|tab(?=index)|text|top|value|variant)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalizeProp(lcName: string) {
    return lcName.replace(regCapitalize, (char) => char.toUpperCase());
}

function GetAttribute(elm: HTMLElement, name: string, bRequired?: boolean, bHashAllowed?: boolean) {
    let value = elm.getAttribute(name);
    if (value==null && bHashAllowed) {
        name = `#${name}`;
        value = elm.getAttribute(name);
    }
    if (value != null)
        elm.attributes.removeNamedItem(name);
    else if (bRequired)
        throw `Missing attribute [${name}]`;
    return value;
}

function OuterOpenTag(elm: HTMLElement, maxLength?: number): string {
    return Abbreviate(/<.*?(?=>)/.exec(elm.outerHTML)[0], maxLength-1) + '>';
}
function Abbreviate(s: string, maxLength: number) {
    if (maxLength && s.length > maxLength)
        return s.substr(0, maxLength - 3) + "...";
    return s;
}

function CBool(s: string|boolean, valOnEmpty: boolean = true): boolean {
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

function thrower(err: string = 'Internal error'): never { throw err; }

export let RHTML = new RCompiler();

Object.defineProperties(
    globalThis,
    {
        RVAR:       {get: () => RHTML.RVAR.bind(RHTML)},
        RUpdate:    {get: () => RHTML.RUpdate.bind(RHTML)},
    }
);
globalThis.RCompile = RCompile;
export const 
    RVAR = globalThis.RVAR as <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>, 
    RUpdate = globalThis.RUpdate as () => void;

export function* range(from: number, upto?: number, step: number = 1) {
	if (upto === undefined) {
		upto = from;
		from = 0;
	}
	for (let i= from; i<upto; i += step)
		yield i;
}
globalThis.range = range;

export const docLocation = RVAR<string>('docLocation');
function SetDocLocation()  { 
    docLocation.V = document.location.href;
    docLocation['subpath'] = document.location.pathname.substr(RootPath.length);
}
window.addEventListener('popstate', SetDocLocation );
export const reroute = globalThis.reroute = (arg: Event | string) => {
    history.pushState(null, null, typeof arg=='string' ? arg : (arg.target as HTMLAnchorElement).href );
    SetDocLocation();
    return false;
}