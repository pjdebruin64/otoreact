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
        R.ToBuild.push({parent: elm, start: elm.firstChild, bInit: true, env: [], })

        if (R.Settings.bBuild)
            RUpdate();
        
        return R;
    }
    catch (err) {
        window.alert(`Re-Act error: ${err}`);
    }
}


// Een context is een rij identifiers die in een te transformeren DOM-tree kunnen voorkomen, maar waarvan de waarde nog niet bekend is
type Context = Array<string>;
// Een environment is een rij concrete waarden voor de identifiers IN EEN GEGEVEN CONTEXT
type Environment = Array<unknown>;
// Een afhankelijke waarde in een gegeven context is een waarde die afhangt van een environment.
// Dit wordt de betekenis, denotatie, van een expressie van type T.
type Dependent<T> = (env: Environment) => T;

type Region     = {parent: Element, marker?: ChildNode, start:  ChildNode, bInit: boolean, env: Environment, lastMarker?: ChildNode};
type ElmBuilder = (this: RCompiler, reg: Region) => void;
type ParentNode = HTMLElement|DocumentFragment;
//type FragmentCompiler = (srcParent: ParentNode, srcElm: HTMLElement) => ElmBuilder

type Subscriber = {parent: Element, marker: ChildNode, env: Environment, builder: ElmBuilder };

type Handler = (ev:Event) => any;

type Parameter = {pid: string, pdefault: Dependent<unknown>, initVar?: LVar};
class Construct {
    constructor(
        public TagName: string,
        public Parameters: Array<Parameter> = [],
        public Slots = new Map<string, Construct>(),
    ){ }


    Builders: ElmBuilder[];
    ConstructEnv: Environment;
}

type RVAR_Light<T> = T & {
    _Subscribers?: Array<Subscriber>,
    _UpdatesTo?: Array<_RVAR<unknown>>,
    Subscribe?: (sub:Subscriber) => void
};
type LVar = (env: Environment) => (value: unknown) => void;

const globalEval = eval;

enum ModifierType {Attr, Prop, Class, Style, Event, Apply, AddToStyle, AddToClassList}

let num=0;
class RCompiler {
    instanceNum = num++;
    private Context: Context;
    private ContextMap: Map<string, number>;

    private Constructs: Map<string, Construct>;
    private HiddenConstructs: Array<[string, Construct]>= [];

    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(clone?: RCompiler) { 
        this.Context    = clone ? clone.Context.slice() : [];
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
    }

    private SaveContext() {
        return this.Context.length;
    }
    private hiddenEnv: Array<[number, unknown]> = [];
    private NewVar(name: string): LVar {
        if (!name)
            return (_) => (_) => {};

        let i = this.ContextMap.get(name);
        const bNewName = i == null;
        if (bNewName){
            i = this.Context.push(name) - 1;
            this.ContextMap.set(name, i);
        }
        return function InitVar(this: RCompiler, env: Environment) {
            if (bNewName)
                env.push(null);
            else
                this.hiddenEnv.push([i, env[i]]);
            
            return function SetVar(value: unknown) {
                env[i] = value;
            }
            }.bind(this) as (env: Environment) => (value?: unknown) => void            
    }
    private RestoreContext(contextLength: number) {
        for (let j = this.Context.length; j > contextLength; j--) {
            const name = this.Context.pop();
            this.ContextMap.delete(name);
        }
    }
    private SaveEnv(env:Environment): [number, number] {
        return [env.length, this.hiddenEnv.length];
    }
    private RestoreEnv(env: Environment, [envLength, hiddenLength]: [number, number]) {
        env.length = envLength;
        for (let j = this.hiddenEnv.length; j>hiddenLength; j--) {
            const [i, value] = this.hiddenEnv.pop();
            env[i] = value;
        }
    }

    private SaveConstructs(): number {
        return this.HiddenConstructs.length;
    }
    private AddConstruct(C: Construct) {
        this.HiddenConstructs.push([C.TagName, this.Constructs.get(C.TagName)]);
        this.Constructs.set(C.TagName, C);
    }
    private RestoreConstructs(savedConstructs: number) {
        for (let i=this.HiddenConstructs.length; i>savedConstructs; i--) {
            const [name, C] = this.HiddenConstructs.pop();
            this.Constructs.set(name, C);
        }}

    private hiddenConstructEnvs: Array<[Construct, Environment]> = [];
    private SaveHiddenCEnvs() {
        return this.hiddenConstructEnvs.length;
    }
    private RestoreHiddenCEnvs(savedHiddenCEnvs: number) {
        for (let j=this.hiddenConstructEnvs.length; j> savedHiddenCEnvs; j--) {
            const [constr, env] = this.hiddenConstructEnvs.pop();
            constr.ConstructEnv = env;
        }
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
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
        this.bCompiled = true;
    }

    public Build(reg: Region & {marker?: ChildNode}) {
        let savedRCompiler = RHTML;
        RHTML = this;
        this.Builder(reg);
        this.AllRegions.push({
            parent: reg.parent, marker: reg.marker, builder: this.Builder, env: []
        })
        RHTML = savedRCompiler;
    }

    public Settings: FullSettings;
    public ToBuild: Region[] = [];
    private AllRegions: Subscriber[] = [];
    private Builder: ElmBuilder;

    private bCompiled = false;
    private bHasReacts = false;

    public DirtyRegions = new Set<Subscriber>();
    public bSomethingDirty: boolean;

    // Bijwerken van alle elementen die afhangen van reactieve variabelen
    private bUpdating = false;
    private handleUpdate: number = null;
    public RUpdate = function RUpdate(this: RCompiler) {
        clearTimeout(this.handleUpdate);
        this.handleUpdate = orgSetTimeout(() => {
            this.handleUpdate = null;
            this.DoUpdate();
        }, 0);
    }.bind(this) as () => void;

    private DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        
        this.bUpdating = true;

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
            let savedRCompiler = RHTML;
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
            this.DirtyRegions.clear();
            RHTML = savedRCompiler;
        }
        this.bUpdating = false;
    }

    /* A "responsive variable" is a variable which listeners can subscribe to.
    */
    RVAR = function<T>(this: RCompiler,
        name?: string, 
        initialValue?: T, 
        storage?: Store
    ) {
        let V = new _RVAR<T>(this, name, initialValue, storage);
        if (!this.bUpdating)
            this.rvarList.push(V);
        return V;
    }.bind(this) as <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>;
    private rvarList: _RVAR<unknown>[] = [];
    
    public setTimeout = function(handler: Function, timeout?: number, ...args: any[]) {
        return orgSetTimeout( UpdateTimerHandler(this, handler), timeout, ...args );
    }.bind(this);
    public setInterval = function(handler: Function, timeout?: number, ...args: any[]) {
        return orgSetInterval( UpdateTimerHandler(this, handler), timeout, ...args );
    }.bind(this);

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
                        for(const rvar of t._UpdatesTo)
                            rvar.SetDirty();
                        for(const sub of t._Subscribers)
                            R.DirtyRegions.add(sub);
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
        childNodes: ChildNode[] = Array.from( srcParent.childNodes )
    ): ElmBuilder {
        const builders = [] as Array< [ElmBuilder, ChildNode] >;
        const savedContext = this.SaveContext();
        const savedConstructs = this.SaveConstructs();
;
        for (const srcNode of childNodes)
        {
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    builders.push(... this.CompileElement(srcParent, srcNode as HTMLElement))
                    break;

                case Node.TEXT_NODE:
                    const str = (srcNode as Text).data.replace(/^\s+|\s+$/g, ' ');
                    const getText = this.CompileInterpolatedString( str );

                    builders.push( [
                        function Text(region: Region) {
                            const {start, lastMarker, bInit} = region, content = getText(region.env);
                            let text: Text;
                            if (bInit && start != srcNode)
                                text = region.parent.insertBefore(document.createTextNode(content), start);
                            else {
                                (start as Text).data = content;
                                region.start = start.nextSibling;
                            }
                            if (lastMarker) {
                                lastMarker['nextM'] = text;
                                region.lastMarker = null;
                            }
                            
                        },
                        srcNode] );
                    break;

                default:    // Other nodes (especially comments) are removed
                    srcParent.removeChild(srcNode);
                    continue;
            }
        };
        this.sourceNodeCount += childNodes.length;

        this.RestoreConstructs(savedConstructs)
        this.RestoreContext(savedContext);

        return function ChildNodes(region) {
                const savedEnv = this.SaveEnv(region.env), savedCEnvs = this.SaveHiddenCEnvs();
                try {
                    for(const [builder, node] of builders)
                        this.CallWithErrorHandling(builder, node, region);
                    this.builtNodeCount += builders.length;
                }
                finally {
                    this.RestoreEnv(region.env, savedEnv);
                    this.RestoreHiddenCEnvs(savedCEnvs);
                }
            };
    }

    private CompileElement(srcParent: ParentNode, srcElm: HTMLElement): [ElmBuilder, ChildNode][] {
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
                    case 'DEFINE': { // 'LET' staat de parser niet toe.
                        // En <DEFINE> moet helaas afgesloten worden met </DEFINE>; <DEFINE /> wordt niet herkend.
                        srcParent.removeChild(srcElm);
                        const rvarName = GetAttribute(srcElm, 'rvar');
                        const varName = rvarName || GetAttribute(srcElm, 'name') || GetAttribute(srcElm, 'var', true);
                        const getValue = this.CompileAttributeExpression<unknown>(srcElm, 'value');
                        const newVar = this.NewVar(varName);

                        builder = function DEFINE(region) {
                                const {marker} = PrepareRegion(srcElm, region);
                                if (region.bInit){
                                    const value = getValue && getValue(region.env);
                                    marker['rValue'] = rvarName ? this.RVAR(null, value) : value;
                                }
                                newVar(region.env)(marker['rValue']);
                            };
                    } break;

                    case 'IF':
                    case 'CASE': {
                        const caseList = [] as Array<{condition: Dependent<boolean>, builder: ElmBuilder, child: HTMLElement}>;
                        const getCondition = (srcElm.nodeName == 'IF') && this.CompileAttributeExpression<boolean>(srcElm, 'cond', true);
                        const bodyNodes: ChildNode[] = [];
                        for (const child of srcElm.children as Iterable<HTMLElement>) {
                            switch (child.nodeName) {
                                case 'WHEN':
                                    caseList.push({
                                        condition: this.CompileAttributeExpression<boolean>(child, 'cond', true)
                                        , builder: this.CompileChildNodes(child)
                                        , child
                                    });
                                    break;
                                case 'ELSE':
                                    caseList.push({
                                        condition: (_env) => true
                                        , builder: this.CompileChildNodes(child)
                                        , child
                                    });
                                    break;
                                default: bodyNodes.push(child);
                            }
                        }
                        if (getCondition)
                            caseList.unshift({
                                condition: getCondition,
                                builder: this.CompileChildNodes(srcElm, bodyNodes),
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
                    } break;
                            
                    case 'FOR':
                    case 'FOREACH':
                        builder = this.CompileForeach(srcParent, srcElm);
                    break;
                        
                    case 'INCLUDE': {
                        const src = GetAttribute(srcElm, 'src', true);
                        // Placeholder that will contain a Template when the file has been received
                        let C: RCompiler = new RCompiler(this);
                        // List of nodes that have to be build when the builder is received
                        let arrToBuild: Array<Region> = [];
                        
                        fetch(src)
                        .then(async response => {
                            
                            const textContent = await response.text();
                            // Parse the contents of the file
                            const parser = new DOMParser();
                            const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;

                            // Compile the parsed contents of the file in the original context
                            C.Compile(parsedContent.body, this.Settings, );

                            // Achterstallige Builds uitvoeren
                            for (const region of arrToBuild)
                                if (region.parent.isConnected)   // Sommige zijn misschien niet meer nodig
                                    C.Builder(region);

                            arrToBuild = null;
                        });

                        builder = 
                            // Runtime routine
                            function INCLUDE (region) {
                                /*
                                const {start, bInit} = region;
                                if (bInit && start == srcElm) {
                                    region.start = start.nextSibling;
                                    region.parent.removeChild(start);
                                }
                                */
                                const subregion = PrepareRegion(srcElm, region);

                                // Als de builder ontvangen is, dan meteen uitvoeren
                                if (C.bCompiled)
                                    C.Builder(subregion);
                                else {
                                    // Anders het bouwen uitstellen tot later
                                    subregion.env = region.env.slice();    // Kopie van de environment maken
                                    arrToBuild.push(subregion);
                                }
                            };
                    } break;

                    case 'REACT': {
                        this.bHasReacts = true;
                        const expList = GetAttribute(srcElm, 'on', true, true).split(',');
                        const getDependencies = expList.map( expr => this.CompileExpression<_RVAR<unknown>>(expr) );

                        // We transformeren de template in een routine die gewenste content genereert
                        const bodyBuilder = this.CompileChildNodes(srcElm);
                        
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
                                    env: subregion.env.slice(),
                                };
                        
                                // Subscribe bij de gegeven variabelen
                                for(const getRvar of getDependencies) {
                                    const rvar = getRvar(subregion.env);
                                    rvar.Subscribe(subscriber);
                                }
                            }
        
                            bodyBuilder.call(this, subregion);
                        }
                    } break;

                    case 'RHTML': {
                        const bodyBuilder = this.CompileChildNodes(srcElm);
                        srcParent.removeChild(srcElm);

                        builder = function RHTML(region) {
                            const tempElm = document.createElement('RHTML');
                            bodyBuilder.call(this, {parent: tempElm, start: null, env: region.env, bInit: true});
                            const result = tempElm.innerText

                            const subregion = PrepareRegion(srcElm, region, result);

                            if (subregion.bInit) {
                                tempElm.innerHTML = tempElm.innerText;

                                const R = new RCompiler();
                                subregion.env = [];
                                R.Compile(tempElm, {bRunScripts: true });

                                R.Build(subregion);
                            }
                        };                                
                    } break;

                    //case 'WINDOW':
                    //case 'PRINT': { } break;

                    case 'SCRIPT': 
                        builder = this.CompileScript(srcParent, srcElm); break;

                    case 'COMPONENT': 
                        return this.CompileComponent(srcParent, srcElm)

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        builder = this.CompileRegularElement(srcElm);
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
                        env: region.env.slice(),
                    };
            
                    // Subscribe bij de gegeven variabelen
                    for(const getRvar of getDependencies) {
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
        try {
            try {
                builder.call(this, region);
            }
            finally {
                let start: ChildNode;
                if ((start = region.start) && start['RError']) {
                    region.parent.removeChild(start);
                    region.start = start.nextSibling;
                }
            }
        } 
        catch (err) { 
            const message = 
                srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const RError = 
                    region.parent.insertBefore(
                        document.createTextNode(message), region.start
                    );
                RError['RError'] = true;
                
                }
        }
    }

    private CompileScript(srcParent: ParentNode, srcElm: HTMLElement) {
        srcParent.removeChild(srcElm);
        if (!(this.Settings.bRunScripts || srcElm.hasAttribute('nomodule')))
            return null;
        const script = srcElm.textContent
            //, bIsModule = (GetAttribute(srcElm, 'type') == 'module');
        let bDone = false;  
        return function SCRIPT(_: Region) {
            if (!bDone) {
                //if (bIsModule)
                //    import( `data:text/javascript;charset=utf-8,${encodeURI(script)}`);
                //else
                globalEval(`'use strict';${script}`);
                bDone = true;
            }
        };
    }

    private CompileForeach(srcParent: ParentNode, srcElm: HTMLElement) {
        const varName = GetAttribute(srcElm, 'let');
        if (!varName) { 
            /* Iterate over multiple slot instances */
            const ofExpression = GetAttribute(srcElm, 'of', true, true);
            const slot = this.Constructs.get(ofExpression)
            if (!slot)
                throw `Missing attribute [let]`;

            const bodyBuilder = this.CompileChildNodes(srcElm);
            srcParent.removeChild(srcElm);

            return function FOREACH_Slot(region) {
                let subregion = PrepareRegion(srcElm, region);
                const slotBuilders = slot.Builders;
                for (const slotBuilder of slotBuilders) {
                    slot.Builders = [slotBuilder];
                    bodyBuilder.call(this, subregion);
                }
                slot.Builders = slotBuilders;
            }
        }
        else { /* A regular iteration */
            interface Item {};  // Three unknown but distinct types
            interface Key {};
            interface Hash {};
            const getRange = this.CompileAttributeExpression<Iterable<Item>>(srcElm, 'of' );
            const indexName = srcElm.getAttribute('index');
            const prevName = srcElm.getAttribute('previous');

            const bUpdateable = CBool(srcElm.getAttribute('updateable'), true);
            const getUpdatesTo = this.CompileAttributeExpression<_RVAR<unknown>>(srcElm, 'updates');
            
            const savedContext = this.SaveContext();
            try {
                // Voeg de loop-variabele toe aan de context
                const initVar = this.NewVar(varName);

                const getKey = this.CompileAttributeExpression<Key>(srcElm, 'key');
                const getHash = this.CompileAttributeExpression<Hash>(srcElm, 'hash');

                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);
                
                // Compileer alle childNodes
                if (srcElm.childNodes.length ==0)
                    throw "FOREACH has an empty body.\nIf you placed <FOREACH> within a <table>, then the parser has rearranged these elements.\nUse <table.>, <tr.> etc instead.";
                const bodyBuilder = this.CompileChildNodes(srcElm);
                
                srcParent.removeChild(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return function FOREACH(this: RCompiler, region: Region) {
                        let subregion = PrepareRegion(srcElm, region, null, (getKey == null));
                        let {parent, marker, start, env} = subregion;
                        const saveEnv = this.SaveEnv(env);

                        // Map of previous data, if any
                        const keyMap: Map<Key, Subscriber>
                            = (region.bInit ? marker['keyMap'] = new Map() : marker['keyMap']);
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
                            while (start && start != region.start && !newMap.has(key = start['key'])) {
                                if (key != null)
                                    keyMap.delete(key);
                                const nextMarker = (start['nextM'] as ChildNode);
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

                            let marker: ChildNode;
                            let subscriber = keyMap.get(key);
                            let childRegion: ReturnType<typeof PrepareRegion>;
                            if (subscriber && subscriber.marker.isConnected) {
                                // Item already occurs in the series
                                marker = subscriber.marker;
                                const nextMarker = marker['nextM'];
                                
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
                                    lastMarker['nextM'] = marker;
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
                                    env: (bUpdateable ? env.slice() : undefined), 
                                }
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, subscriber);
                                }
                                marker = childRegion.marker
                                marker['key'] = key;
                            }

                            if (hash != null
                                && ( hash == marker['hash'] as Hash
                                    || (marker['hash'] = hash, false)
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

                        // Oude environment herstellen
                        this.RestoreEnv(env, saveEnv);
                    };
            }
            finally {
                this.RestoreContext(savedContext);
            }
        }
    }

    private ParseSignature(elmSignature: Element):  Construct {
        const comp = new Construct(elmSignature.tagName);
        for (const attr of elmSignature.attributes) {
            const m = /^(#)?(.*?)(\?)?$/.exec(attr.name);
            comp.Parameters.push(
                { pid: m[2]
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
        const bRecursive = srcElm.hasAttribute('recursive');
        const builders: [ElmBuilder, ChildNode][] = [];

        let elmSignature = srcElm.firstElementChild;
        if (!elmSignature || elmSignature.tagName=='TEMPLATE')
            throw `Missing signature`;

        const component = this.ParseSignature(elmSignature);

        for(let srcChild of srcElm.children as Iterable<HTMLElement>)
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    const builder = this.CompileScript(srcElm, srcChild);
                    if (builder) builders.push([builder, srcChild]);
                    break;
                case 'STYLE':

                    break;
            }

        if (bRecursive)
            this.AddConstruct(component);

        const template = RequiredChildElement(srcElm, 'TEMPLATE') as HTMLTemplateElement;

        component.Builders = [
            this.CompileConstructTemplate(component, template.content, template)
        ];
        
        if (!bRecursive)
            this.AddConstruct(component);
        
        builders.push( [function(this: RCompiler, reg) {
            // At runtime, we just have to remember the environment that matches the context
            this.hiddenConstructEnvs.push([component, component.ConstructEnv]);
            component.ConstructEnv = reg.env.slice();
        }, srcElm]);
        return builders;
    }

    private CompileConstructTemplate(construct: Construct, contentNode: ParentNode, srcElm: HTMLElement, bInstance?: boolean): ElmBuilder {

        const savedContext = this.SaveContext();
        const savedConstructs = this.SaveConstructs();
        for (let param of construct.Parameters)
            param.initVar = this.NewVar(bInstance && GetAttribute(srcElm, param.pid, true) || param.pid);
        for (const S of construct.Slots.values())
            this.AddConstruct(S);
        try {
            return this.CompileChildNodes(contentNode);
        }
        catch (err) {throw `${OuterOpenTag(srcElm)} ${err}`;}
        finally {
            this.RestoreConstructs(savedConstructs);
            this.RestoreContext(savedContext);      
        }
    }

    private CompileConstructInstance(srcParent: ParentNode, srcElm: HTMLElement,
        construct: Construct) {
        srcParent.removeChild(srcElm);
        let attVal: string;
        const computeParameters: Array<Dependent<unknown>> = [];
        for (const {pid, pdefault} of construct.Parameters)
            try {
                computeParameters.push(
                ( (attVal = srcElm.getAttribute(`#${pid}`)) != null
                    ? this.CompileExpression( attVal )
                : (attVal = srcElm.getAttribute(pid)) != null
                    ? this.CompileInterpolatedString( attVal )
                : pdefault != null
                    ? (_env) => pdefault(construct.ConstructEnv)
                : thrower(`Missing parameter [${pid}]`)
                ))
            }
            catch (err) { throw `[${pid}]: ${err}`; }

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
                    this.CompileConstructTemplate(Slot, slotElm, slotElm, true)
                );
                srcElm.removeChild(node);
            }
        
        const contentSlot = construct.Slots.get('CONTENT');
        if (contentSlot)
            slotBuilders.get('CONTENT').push(
                this.CompileConstructTemplate(contentSlot, srcElm, srcElm, true)
            );

        return (region: Region) => {
            const subregion = PrepareRegion(srcElm, region);
            const env = subregion.env;  
            const componentEnv = construct.ConstructEnv.slice();    // Copy, just in case the component is recursive
            let i = 0;
            for ( const param of construct.Parameters) {
                param.initVar(componentEnv)(computeParameters[i](env));
                i++;
            }
            const prevBuilders: Array<[ElmBuilder[], Environment]> = [];        
            i = 0;
            for (const [name, slot] of construct.Slots) {
                prevBuilders.push([slot.Builders, slot.ConstructEnv]);
                slot.Builders = slotBuilders.get(name);
                slot.ConstructEnv = env.slice();
            }

            try { 
                for (const builder of construct.Builders)
                    builder.call(this, {...subregion, env: componentEnv, }); 
            }
            finally {
                i = 0;
                for (const slot of construct.Slots.values())
                    [slot.Builders, slot.ConstructEnv] = prevBuilders[i++];
            }
        }
    }

    private CompileRegularElement(srcElm: HTMLElement) {
        // Remove trailing dots
        const nodeName = srcElm.nodeName.replace(/\.$/, '');

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
                        `function ${attrName}(event){${CheckForComments(attr.value)}}`);
                    arrModifiers.push({
                        modType: ModifierType.Event, name: m[1], 
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
                else if (attrName == "apply")
                    arrModifiers.push({
                        modType: ModifierType.Apply, name: null,
                        depValue: this.CompileExpression(`function apply(){${CheckForComments(attr.value)}}`)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attrName)) { // *, **, @, @@
                    const propName = CapitalizeProp(m[3]);
                    const setter = this.CompileExpression<Handler>(
                        `function (){let ORx=this.${propName};if(${attr.value}!==ORx)${attr.value}=ORx}`);
                    arrModifiers.push(
                        m[1] == '*'
                        ? { modType: ModifierType.Apply, name: null,     depValue: setter, }
                        : { modType: ModifierType.Prop,  name: propName, depValue: this.CompileExpression<unknown>(attr.value) }
                    );
                    arrModifiers.push({
                        modType: ModifierType.Event, name: m[2] ? 'change' : 'input', tag: propName, depValue: setter,
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

        // Compile the given childnodes into a routine that builds the actual childnodes
        const childnodesBuilder = this.CompileChildNodes(srcElm);

        // Now the runtime action
        return function Element(region: Region) {
            const {parent, start, bInit, env, lastMarker} = region;
            // Create the element
            let elm: HTMLElement;
            if (!bInit || start == srcElm) {
                region.start = start.nextSibling;
                if ((start as HTMLElement).tagName == nodeName) {
                    elm = start as HTMLElement;
                    elm.classList.remove(...elm.classList);
                }
                else {
                    (elm = document.createElement(nodeName)).append(...start.childNodes);
                    parent.replaceChild(elm, start);
                }
            }
            else {
                elm = document.createElement(nodeName);
                parent.insertBefore(elm, start);
            }
            if (lastMarker) {
                lastMarker['nextM'] = elm;
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
                        case ModifierType.Event: {
                            // We store the new handler under some 'tag', so that we can remove it on the next run
                            const tag = `$$${mod.tag ?? attName}`;
                            let prevHandler: EventListener;
                            if (prevHandler = elm[tag]) elm.removeEventListener(attName, prevHandler) 
                            elm.addEventListener(attName, elm[tag] = UpdateHandler(this, (val as Handler).bind(elm)
                                ));
                        } break;
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
                        case ModifierType.Apply:
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
    }

    private CompileInterpolatedString(data: string, name?: string): Dependent<string> {
        const generators: Array< string | Dependent<unknown> > = [];
        function addString(s: string) {
            generators.push( s.replace(/\\([{}\\])/g, '$1') );  // Replace '\{' etc by '{'
        }

        const reg =
            /(?<!\\)\{(.*?)(?<!\\)\}|$/gs;
        while (reg.lastIndex < data.length) {
            const lastIndex = reg.lastIndex
            const m = reg.exec(data);
            const fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;

            if (fixed)
                addString(fixed);
            if (m[1])
                generators.push( this.CompileExpression<string>(m[1], '{}', null, true) );
        }

        return (env) => {
            try {
                let result = "";
                for (const gen of generators)
                    result += 
                        ( typeof gen == 'string' ? gen : gen(env) ?? '');
                return result;
            }
            catch (err) { throw `[${name}]: ${err}`; }
        }
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
        expr = CheckForComments(expr);
        let depExpr = 
            bScript 
            ?  `([${this.Context.join(',')}]) => {'use strict';${expr}}`  // Braces
            :  `([${this.Context.join(',')}]) => (${expr})`;              // Parentheses
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
    let marker: Comment;
    if (bInit) {
        marker = region.lastMarker = parent.insertBefore(document.createComment(name || srcElm.tagName), start);
        if (lastMarker)
            lastMarker['nextM'] = marker;
        
        if (start && start == srcElm)
            region.start = start.nextSibling;
    }
    else {
        marker = start as Comment;
        region.start = marker['nextM'];
    }
    start = marker.nextSibling;

    if (bInit ||= (bForcedClear || (result != marker['rResult'] ?? null)) ) {
        marker['rResult'] = result;
        while (start != region.start) {
            const next = start.nextSibling;
            parent.removeChild(start);
            start = next;
        }
    }
    return {parent, marker, start, bInit, env: region.env};
}

// Deze routine zet een gegeven MouseHandler om in een handler die hetzelfde doet en daarna alle benodigde elementen update
function UpdateHandler(R: RCompiler, handler: Handler): Handler {
    return handler &&
        function ReactiveHandler(ev: Event) {
            // console.log(`EVENT ${name}`);
            const result = handler(ev);
            // De handler mag een Promise opleveren; in dat geval doen we de RUpdate pas wanneer de promise vervult is
            if (result instanceof Promise) {
                result.then(R.RUpdate);
                ev.preventDefault();
                return;
            }
        
            R.RUpdate();
            // Als de handler, gedefinieerd als attribuut, false oplevert, dan wordt de default actie vanzelf voorkomen.
            // Wij voegen de handler toe middels 'addEventListener' en dan gaat dat niet vanzelf.
            // We lossen het zo op:
            if (result === false)
                ev.preventDefault();
            return result;
        };
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
        private storage?: Store
    ) {
        if (name) {
            //if (name in globalThis) window.alert(`new RVAR('${name}'): '${name}' already exists.`);
            globalThis[name] = this;
        }
        let s: string;
        if ((s = storage?.getItem(`RVAR_${name}`)) != null)
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
            this.storage?.setItem(`RVAR_${this.name}`, JSON.stringify(t));
        }
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { this.SetDirty();  return this._Value; }
    set U(t: T) { this.V = t;   this.rRuntime.RUpdate();  }

    SetDirty() {
        for(const sub of this.Subscribers)
            if (sub.parent.isConnected)
                this.rRuntime.DirtyRegions.add(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.bSomethingDirty = true;
    }
}
    
function UpdateTimerHandler(R: RCompiler, handler: Function) {
    return function(...args) { 
        const result = handler(...args);
        if (result instanceof Promise)
            result.then(R.RUpdate);
        else
            R.RUpdate();
    }
}

function CapitalizeProp(lcName: string) {
    let m: RegExpExecArray;
    lcName = lcName.replace('html', 'HTML');
    while(m = /^(.*(align|animation|aria|background|border|bottom|class|client|column|content|element|font|image|inner|left|right|rule|top|value))([a-z])(.*)$/.exec(lcName))
        lcName = `${m[1]}${m[3].toUpperCase()}${m[4]}`;
    return lcName;
}

function CheckForComments(script: string) {
    // When the script contains '//' without a trailing newline, which might be a comment
    const hasComments = /\/\/[^\n]*$/.test(script);
    // Then add a newline to terminate the possible comment
    return hasComments ? script + '\n' : script;
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


// Modify timer functions to include an RUpdate
const orgSetTimeout = globalThis.setTimeout;
const orgSetInterval = globalThis.setInterval;
export let RHTML = new RCompiler();
export const 
    RVAR = RHTML.RVAR, 
    RUpdate = RHTML.RUpdate,
    setTimeout = RHTML.setTimeout, 
    setInterval = RHTML.setInterval;

Object.defineProperties(
    globalThis,
    {
        RVAR:       {get: () => RHTML.RVAR},
        RUpdate:    {get: () => RHTML.RUpdate},
        setTimeOut: {get: () => RHTML.setTimeout},
        setInterval:{get: () => RHTML.setInterval},
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