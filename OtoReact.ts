// Global settings
const defaultSettings = {
    bTiming:        false,
    bAbortOnError:  false,  // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    true,   // Show runtime errors as text in the DOM output
    bRunScripts:    false,
    bBuild:         true,
    rootPattern:    '/|^' as string,
    preformatted:   [],
    bNoGlobals:     false,
    bDollarRequired: false,
}

// A DOMBUILDER is the semantics of a piece of RHTML.
// It can both build (construct) a new piece of DOM, and update an existing piece of DOM.
type DOMBuilder = ((reg: Area) => Promise<HTMLElement | void>) & {ws?: WhiteSpc};
enum WhiteSpc {preserve, keep, trim}

// An AREA is the (runtime) place to build or update, with all required information
type Area = {
    range?: Range,              // Existing piece of DOM
    parent: Node;               // DOM parent node
    env: Environment;
    before?: Comment;

    /* When !range: */
    source?: ChildNode;         // Optional source node to be replaced by the range 
    parentR?: Range;            // The new range shall either be the first child of some range,
    prevR?: Range;              // Or the next sibling of some other range

    /* When range: */
    bNoChildBuilding?: boolean, // true == just update the root node, not its children
}

// A RANGE is a piece of constructed DOM, in relation to the source RHTML.
// It can either be a single DOM node or a linked list of subranges,
class Range<NodeType extends ChildNode = ChildNode> {
    
    child: Range;           // Linked list of children (null=empty)
    next: Range = null;     // Next item in linked list

    /* For a range corresponding to a DOM node, the child ranges will correspond to child nodes of the DOM node.
    */

    endMark?: Comment;

    constructor(
        public node?: NodeType,     // Corresponding DOM node, if any
        public text?: string,       // Description, used only for comments
    ) {
        if (!node) this.child = null;
    }
    toString() { return this.text || this.node?.nodeName; }

    result?: any;
    value?: any;
    errorNode?: ChildNode;

    // Only for FOR-iteraties
    hash?: Hash; key?: Key; prev?: Range;
    fragm?: DocumentFragment;
    rvar?: RVAR_Light<Item>;

    // For reactive elements
    updated?: number;

    public get First(): ChildNode {
        let f: ChildNode
        if (f = this.node) return f;
        let child = this.child;
        while (child) {
            if (f = child.First) return f;
            child = child.next;
        }
        return this.endMark || null;
    }

    // Enumerate all DOM nodes within this range, not including their children
    Nodes(): Generator<ChildNode> { 
        return (function* Nodes(r: Range) {
            if (r.node)
                yield r.node;
            else {
                let child = r.child;
                while (child) {
                    yield* Nodes(child as Range);
                    child = child.next;
                }
            }
            if (r.endMark)
                yield r.endMark;
        })(this)
    }
    
    public get isConnected(): boolean {
        const f = this.First;
        return f && f.isConnected;
    }
}

// A CONTEXT is the set of local variable names, each with a number indicating its position in an environment
type Context = Map<string, number>;

// An ENVIRONMENT for a given context is the array of concrete values for all names in that context,
// together with concrete definitions for all visible constructs
type Environment = 
    Array<unknown> 
    & { constructs: Map<string, ConstructDef> };

// A  DEPENDENT value of type T in a given context is a routine computing a T using an environment for that context.
// It may carry an indicator that the routine might need a value for 'this'.
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dependent<T> = ((env: Environment) => T) & {bThis?: boolean};


function PrepArea(srcElm: HTMLElement, area: Area, text: string = '',
    bMark?: boolean|1|2,  // true=mark area, no wiping; 1=wipe when result has changed; 2=wipe always
    result?: any,
) : {range: Range, subArea:Area, bInit: boolean}
{
    let {parent, env, range, before} = area,
        subArea: Area = {parent, env, range: null, }
        , bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        if (srcElm) text = `${srcElm.localName}${text?' ':''}${text}`;
        
        UpdatePrevArea(area, range = subArea.parentR = new Range(null, text));
        range.result = result;

        if (bMark)
            before =
            //before ||= 
                range.endMark = parent.insertBefore<Comment>(
                    document.createComment('/'+text), before);
    }
    else {
        subArea.range = range.child;
        area.range = range.next;

        if (bMark) {
            before = range.endMark;
            if (bMark==1 && result != range.result || bMark==2) {
                range.result = result;
                let node = range.First || before;
                while (node != before) {
                    const next = node.nextSibling;
                    parent.removeChild(node);
                    node = next;
                }
                range.child = null;
                subArea.range = null;
                subArea.parentR = range;
                bInit = true;
            }
        }
    }
    
    subArea.before = before;    
    return {range, subArea, bInit};
}
function UpdatePrevArea(area: Area, range: Range) {
    let r: Range
    if (r = area.parentR) {
        r.child = range;
        area.parentR = null;
    }
    else if (r = area.prevR) 
        r.next = range;

    area.prevR = range;
}

function PrepareElement<T={}>(srcElm: HTMLElement, area: Area, nodeName = srcElm.nodeName): 
    {elmRange: Range<HTMLElement> & T, childArea: Area, bInit: boolean} {
    let elmRange = area.range as Range<HTMLElement> & T, bInit = !elmRange;
    if (bInit) {
        const elm: HTMLElement =
            ( area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore<HTMLElement>(document.createElement(nodeName), area.before)
            );
        elmRange = new Range(elm) as Range<HTMLElement> & T;
        UpdatePrevArea(area, elmRange);
    }
    else {
        area.range = elmRange.next
    }
    return {elmRange, 
        childArea: {parent: elmRange.node, range: elmRange.child, before: null, env: area.env, 
        parentR: elmRange},
        bInit};
}

function PrepareText(area: Area, content: string) {
    let range = area.range as Range<Text>;
    if (!range) {
        range = new Range(
            area.parent.insertBefore<Text>(document.createTextNode(content), area.before), 'text'
            );
        UpdatePrevArea(area, range);
    } else {
        range.node.data = content;
        area.range = range.next;
    }
}


type FullSettings = typeof defaultSettings;
type Settings = Partial<FullSettings>;
let RootPath: string = null;
let ToBuild: Area[] = [];

export function RCompile(elm: HTMLElement, settings?: Settings): Promise<void> { 
    const R = RHTML;   
    try {
        const {rootPattern} = R.Settings = {...defaultSettings, ...settings},
            m = location.href.match(`^.*(${rootPattern})`);
        if (!m)
            throw `Root pattern '${rootPattern}' does not match URL '${location.href}'`;
        R.FilePath = location.origin + (
            globalThis.RootPath = RootPath = (new URL(m[0])).pathname.replace(/[^/]*$/, '')
        )
        R.RootElm = elm;
        R.Compile(elm, {}, true);
        ToBuild.push({parent: elm.parentElement, env: NewEnv(), source: elm, range: null});

        return (R.Settings.bBuild
            ? RBuild().then(() => {ScrollToHash();} )
            : null);
    }
    catch (err) {
        window.alert(`OtoReact error: ${err}`);
    }
}

export async function RBuild() {
    const R = RHTML;   
    R.start = performance.now();
    R.builtNodeCount = 0;
    for (const area of ToBuild)
        await R.InitialBuild(area);
    R.logTime(`Built ${R.builtNodeCount} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
    ToBuild = [];
}

type SavedContext = number;
function NewEnv(): Environment { 
    const env = [] as Environment;
    env.constructs = new Map();
    return env;
}
function CloneEnv(env: Environment): Environment {
    const clone = env.slice() as Environment;
    clone.constructs = new Map(env.constructs.entries());
    return clone;
}

type Subscriber = (() => (void|Promise<void>)) &
    {   ref?: {isConnected: boolean};
        sArea?: Area;
        bImm?: boolean
    };

type ParentNode = HTMLElement|DocumentFragment;


type Handler = (ev:Event) => any;
type LVar = ((env: Environment) => (value: unknown) => void) & {varName: string};

// A SIGNATURE describes an RHTML user construct (a component or a slot)
class Signature {
    constructor(public srcElm: Element){ 
        this.name = srcElm.localName;
    }
    public name: string;
    public Parameters: Array<Parameter> = [];
    public RestParam: Parameter = null;
    public Slots = new Map<string, Signature>();

    // Check whether an import signature is compatible with the real module signature
    IsCompatible(sig: Signature): boolean {
        if (!sig) return false;
        let result: any = true;
        
        const mapSigParams = new Map(sig.Parameters.map(p => [p.name, p.pDefault]));
        // All parameters in the import must be present in the module
        for (const {name, pDefault} of this.Parameters)
            if (mapSigParams.has(name)) {
                // When optional in the import, then also optional in the module
                result &&= (!pDefault || mapSigParams.get(name));
                mapSigParams.delete(name);
            }
            else result = false
        // Any remaining module parameters must be optional
        for (const pDefault of mapSigParams.values())
            result &&= pDefault;

        // When the import has a rest parameter, then the module must have it too      
        result &&= !this.RestParam || this.RestParam.name == sig.RestParam?.name;

        // All slots in the import must be present in the module and compatible with the import
        for (let [slotname, slotSig] of this.Slots)
            result &&= sig.Slots.get(slotname)?.IsCompatible(slotSig);
        
        return !!result;
    }
}
// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {name: string, pDefault: Dependent<unknown>};

// A CONSTRUCTDEF is a concrete instance of a signature
type ConstructDef = {templates: Template[], constructEnv: Environment};
type Template = 
    (this: RCompiler, area: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment)
    => Promise<void>;

export type RVAR_Light<T> = T & {
    _Subscribers?: Array<Subscriber>;
    _UpdatesTo?: Array<RVAR>;
    Subscribe?: (sub:Subscriber) => void;
    readonly U?: T;
};

const gEval = eval, gFetch = fetch;

interface Item {}  // Three unknown but distinct types, used by the <FOR> construct
interface Key {}
interface Hash {}

enum ModType {Attr, Prop, Src, Class, Style, Event, AddToStyle, AddToClassList, RestArgument,
    oncreate //, onupdate
}
type Modifier = {
    modType: ModType,
    name: string,
    depValue: Dependent<unknown>,
}
type RestParameter = Array<{modType: ModType, name: string, value: unknown}>;
let bReadOnly: boolean = false;

function ApplyModifier(elm: HTMLElement, modType: ModType, name: string, val: unknown, bCreate: boolean) {    
    switch (modType) {
        case ModType.Attr:
            elm.setAttribute(name, val as string); 
            break;
        case ModType.Src:
            elm.setAttribute('src',  new URL(val as string, name).href);
            break;
        case ModType.Prop:
            if (val != null) {
                if (val !== elm[name]) elm[name] = val;
            }
            else
                delete elm[name];
            break;
        case ModType.Event:
            let m: RegExpMatchArray;
            if (val)
                if(m = /^on(input|change)$/.exec(name)) {
                    elm.addEventListener(m[1], val as EventListener);
                    (elm as any).handlers.push({evType: m[1], listener: val})
                }
                else
                    elm[name] = val; 
            break;
        case ModType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModType.Style:
            elm.style[name] = val || (val === 0 ? '0' : null);
            break;
        case ModType.AddToStyle:
            if (val) 
                for (const [name,v] of Object.entries(val as Object))
                    elm.style[name] = v || (v === 0 ? '0' : null);
            break
        case ModType.AddToClassList:
            switch (typeof val) {
                case 'string': elm.classList.add(val); break;
                case 'object':
                    if (val)
                        if (Array.isArray(val))
                            for (const name of val)
                                elm.classList.add(name);
                        else
                            for (const [name, bln] of Object.entries(val as Object))
                                if (bln) elm.classList.add(name);
                    break;
                default: throw `Invalid '+class' value`;
            }
            break;
        case ModType.RestArgument:
            for (const {modType, name, value} of val as RestParameter)
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case ModType.oncreate:
            if (bCreate)
                (val as ()=>void).call(elm); 
            break;
    }
}
function ApplyModifiers(elm: HTMLElement, modifiers: Modifier[], env: Environment, bCreate?: boolean) {
    // Apply all modifiers: adding attributes, classes, styles, events
    for (const {modType, name, depValue} of modifiers) {
        try {
            bReadOnly= true;
            const value = depValue.bThis ? depValue.call(elm, env) : depValue(env);    // Evaluate the dependent value in the current environment
            bReadOnly = false;
            // See what to do with it
            ApplyModifier(elm, modType, name, value, bCreate)
        }
        catch (err) { throw `[${name}]: ${err}` }
    }
}

const RModules = new Map<string, Promise<DOMBuilder>>();

const envActions: Array<() => void> = [];
type SavedEnv = number;
function SaveEnv(): SavedEnv {
    return envActions.length;
}
function RestoreEnv(savedEnv: SavedEnv) {
    for (let j=envActions.length; j>savedEnv; j--)
        envActions.pop()();
}
function DefConstruct(env: Environment, name: string, construct: ConstructDef) {
    const {constructs} = env, prevDef = constructs.get(name);
    constructs.set(name, construct);
    envActions.push(() => {constructs.set(name, prevDef)})
}

class RCompiler {

    static iNum=0;
    public instanceNum = RCompiler.iNum++;

    private ContextMap: Context;
    private context: string; 

    private CSignatures: Map<string, Signature>;
    private head: Node;
    private StyleBefore: ChildNode;
    private AddedHeaderElements: Array<HTMLElement>;
    public FilePath: string;
    public RootElm: ParentNode;

    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(
        private clone?: RCompiler,
    ) { 
        this.context    = clone?.context || "";
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.CSignatures = clone ? new Map(clone.CSignatures) : new Map();
        this.Settings   = clone ? {...clone.Settings} : {...defaultSettings};
        this.AddedHeaderElements = clone?.AddedHeaderElements || [];
        this.head  = clone?.head || document.head;
        this.StyleBefore = clone?.StyleBefore
        this.FilePath   = clone?.FilePath || location.origin + RootPath;
    }
    private get MainC():RCompiler { return this.clone || this; }

    private restoreActions: Array<() => void> = [];

    private SaveContext(): SavedContext {
        return this.restoreActions.length;
    }
    private RestoreContext(savedContext: SavedContext) {
        for (let j=this.restoreActions.length; j>savedContext; j--)
            this.restoreActions.pop()();
    }

    private NewVar(name: string): LVar {
        let init: LVar;
        if (!name)
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
           init = ((_) => (_) => {}) as LVar;
        else {
            name = CheckValidIdentifier(name);

            let i = this.ContextMap.get(name);
            const bNewName = i == null;
            if (bNewName){
                const savedContext = this.context;
                i = this.ContextMap.size;
                this.ContextMap.set(name, i);
                this.context += `${name},`
                this.restoreActions.push(
                    () => { this.ContextMap.delete( name );
                        this.context = savedContext;
                    }
                );
            }
            init = ((env: Environment) => {
                const prev = env[i], j=i;
                envActions.push( () => {env[j] = prev } );
                
                return (value: unknown) => {env[j] = value };
            }) as LVar;
        }
        init.varName = name;
        return init;        
    }

    private AddConstruct(C: Signature) {
        const Cnm = C.name,
            savedConstr = this.CSignatures.get(Cnm);
        this.CSignatures.set(Cnm, C);
        this.restoreActions.push(
            () => this.CSignatures.set(Cnm, savedConstr)
        );
    }

    // Compile a source tree into an ElmBuilder
    public Compile(
        elm: ParentNode, 
        settings: Settings = {},
        bIncludeSelf: boolean = false,  // Compile the element itself, or just its childnodes
    ) {
        const t0 = performance.now();
        Object.assign(this.Settings, settings);
        for (const tag of this.Settings.preformatted)
            this.mPreformatted.set(tag.toLowerCase(), null);
        const savedR = RHTML; 
        try {
            if (!this.clone) RHTML = this;
            this.Builder =
                bIncludeSelf
                ? this.CompElement(elm.parentElement, elm as HTMLElement, true)[0]
                : this.CompChildNodes(elm);
            this.bCompiled = true;
        }
        finally {
            RHTML = savedR;
        }
        const t1 = performance.now();
        this.logTime(`Compiled ${this.sourceNodeCount} nodes in ${(t1 - t0).toFixed(1)} ms`);
    }

    logTime(msg: string) {
        if (this.Settings.bTiming)
            console.log(msg);
    }

    private mPreformatted = new Map<string,void>([['pre', null]]);
        
    Subscriber({parent, before, bNoChildBuilding, env}: Area, builder: DOMBuilder, range: Range, ...args ): Subscriber {
        const sArea = {
                parent, before, bNoChildBuilding,
                env: CloneEnv(env), 
                range,
            },
            subscriber: Subscriber = () => {
                (this as RCompiler).builtNodeCount++;
                return builder.call(this, {...sArea}, 0, ...args);
            };
        subscriber.sArea = sArea;
        subscriber.ref = before;
        return subscriber;
    }

    public async InitialBuild(area: Area) {
        const savedRCompiler = RHTML, {parentR} = area;
        RHTML = this;
        this.builtNodeCount++;
        await this.Builder(area);

        this.AllAreas.push(this.Subscriber(area, this.Builder, parentR ? parentR.child : area.prevR));
        RHTML = savedRCompiler;
    }

    public Settings: FullSettings;
    private AllAreas: Subscriber[] = [];
    private Builder: DOMBuilder;
    private whiteSpc = WhiteSpc.keep;

    private bCompiled = false;
    private bHasReacts = false;

    public DirtyVars = new Set<RVAR>();
    private DirtySubs = new Map<{isConnected: boolean}, Subscriber>();
    public AddDirty(sub: Subscriber) {
        this.MainC.DirtySubs.set(sub.ref, sub)
    }

    // Bijwerken van alle elementen die afhangen van reactieve variabelen
    private bUpdating = false;
    private bUpdate = false;
    private handleUpdate: number = null;
    RUpdate() {
        this.MainC.bUpdate = true;

        if (!this.clone && !this.bUpdating && !this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 5);
    };

    public start: number;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating) { 
            this.bUpdate = true;
            return;
        }
        
        for (let i=0;i<2;i++) {
            this.bUpdate = false;
            this.bUpdating = true;
            let savedRCompiler = RHTML;
            try {
                if (!this.MainC.bHasReacts)
                    for (const s of this.AllAreas)
                        this.AddDirty(s);

                for (const rvar of this.DirtyVars)
                    rvar.Save();
                this.DirtyVars.clear();
                
                if (this.DirtySubs.size) {
                    if (!this.clone) RHTML = this;
                    this.start = performance.now();
                    this.builtNodeCount = 0;
                    const subs = this.DirtySubs;
                    this.DirtySubs = new Map();
                    for (const sub of subs.values()) 
                        if (!sub.ref || sub.ref.isConnected)
                            try { await sub(); }
                            catch (err) {
                                const msg = `ERROR: ${err}`;
                                console.log(msg);
                                window.alert(msg);
                            }

                    
                    this.logTime(`Updated ${this.builtNodeCount} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
                }
            }
            finally { 
                RHTML = savedRCompiler;this.bUpdating = false;
            }
            if (!this.bUpdate) break;
        } 
    }

    /* A "responsive variable" is a variable which listeners can subscribe to. */
    RVAR<T>(
        name?: string, 
        initialValue?: T, 
        store?: Store
    ) {
        const r = new _RVAR<T>(this.MainC, name, initialValue, store, name);
        //this.CreatedRvars.push(r);
        return r;
    }; // as <T>(name?: string, initialValue?: T, store?: Store) => RVAR<T>;
    
    private RVAR_Light<T>(
        t: RVAR_Light<T>, 
        updatesTo?: Array<RVAR>,
    ): RVAR_Light<T> {
        if (!t._Subscribers) {
            t._Subscribers = []; //subscribers;
            t._UpdatesTo = updatesTo;
            const R: RCompiler = this.MainC;
            Object.defineProperty(t, 'U',
                {get:
                    () => {
                        for (const sub of t._Subscribers)
                            R.AddDirty(sub);
                        if (t._UpdatesTo?.length)
                            for (const rvar of t._UpdatesTo)
                                rvar.SetDirty();
                        else
                            R.RUpdate();
                        return t;
                    }
                }
            );
            t.Subscribe = (sub: Subscriber) => { t._Subscribers.push(sub) } ;
        }
        return t;
    }

    private sourceNodeCount = 0;   // To check for empty Content
    public builtNodeCount = 0;

    private CompChildNodes(
        srcParent: ParentNode,
        childNodes: Iterable<ChildNode> = srcParent.childNodes,
    ): DOMBuilder {
        const saved = this.SaveContext();
        try {
            const builder = this.CompIterator(srcParent, childNodes);
            return builder ?
                 async function ChildNodes(this: RCompiler, area) {
                    const savedEnv = SaveEnv();
                    try { await builder.call(this, area); }
                    finally { RestoreEnv(savedEnv); }
                }
                : async ()=>{};
        }
        finally { this.RestoreContext(saved); }
    }

    private CreatedRvars: RVAR[] = [];
    private RvarsToCheck: Array<{
        rvar: RVAR, 
        builder: (this: RCompiler, area: Area, start: number) => Promise<void>;
        i: number;
    }> = [];

    private CompIterator(srcParent: ParentNode, iter: Iterable<ChildNode>): DOMBuilder {
        const builders = [] as Array< [DOMBuilder, ChildNode, boolean?] >;
        
        for (const srcNode of iter) {
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    this.sourceNodeCount ++;
                    const builderElm = this.CompElement(srcParent, srcNode as HTMLElement);

                    if (builderElm) {                        
                        if (builderElm[0].ws==WhiteSpc.trim) {
                            let i = builders.length - 1;
                            while (i>=0 && builders[i][2]) {
                                builders.pop();
                                i--;
                            }
                        }
                        builders.push(builderElm);
                    }
                    break;

                case Node.TEXT_NODE:
                    this.sourceNodeCount ++;
                    let str = srcNode.nodeValue;
                    if (this.whiteSpc != WhiteSpc.preserve)
                        str = str.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ' ');
                    
                    const getText = this.CompString( str ), fixed = getText.fixed;
                    if (fixed !== '') {
                        if (fixed == undefined)
                            builders.push( [ 
                                async (area: Area) => {
                                    PrepareText(area, getText(area.env))
                                }, srcNode] );
                        else {
                            const isBlank = /^[ \t\r\n]*$/.test(fixed);
                            if (!(this.whiteSpc==WhiteSpc.trim && isBlank))
                                builders.push( [ 
                                    async (area: Area) => {
                                        PrepareText(area, fixed)
                                    }, srcNode, isBlank ] );
                        }
                        if (this.whiteSpc!=WhiteSpc.preserve)
                            this.whiteSpc = /[ \t\r\n]$/.test(getText.last) ? WhiteSpc.trim : WhiteSpc.keep;
                        }
                    break;
            }
        }
        return builders.length == 0 ? null :
            async function Iter(this: RCompiler, area: Area //, start: number = 0
                ) {
                /*
                const bInit = !area.range,
                 saveRvars = this.CreatedRvars.length;
                const iter = builders.values();
                let i = 0, ran;
                while (i < start) {
                    iter.next();
                    i++;
                }  */
                for (const [builder] of builders) {
                    await builder.call(this, area);
                    /*
                    i++;
                    if (bInit)
                        while (this.CreatedRvars.length > saveRvars) {
                            const rvar = this.CreatedRvars.pop();
                            if (!rvar.Subscribers.size)
                                rvar.Subscribe(this.Subscriber(area, builder, , i))
                        }  */
                }
                this.builtNodeCount += builders.length;
            };
        //return builder;
    }

    static genAtts = ['reacton','reactson','thisreactson','oncreate','onupdate'];
    private CompElement(srcParent: ParentNode, srcElm: HTMLElement, bUnhide?: boolean): [DOMBuilder, ChildNode] {
        const atts =  new Atts(srcElm),
            reacts: Array<{attName: string, rvars: Dependent<RVAR[]>}> = [],
            genMods: Array<{attName: string, handler: Dependent<Handler>}> = [];
        if (bUnhide)
            atts.set('#hidden', 'false');
        for (const attName of RCompiler.genAtts)
            if (atts.has(attName))
                if (/^on/.test(attName))
                    genMods.push({attName, handler: this.CompHandler(attName, atts.get(attName))});
                else
                    reacts.push({attName, rvars: this.compAttrExprList<RVAR>(atts, attName)});
        
        let builder: DOMBuilder = null;
labelNoCheck:
        try {
            // See if this node is a user-defined construct (component or slot) instance
            const construct = this.CSignatures.get(srcElm.localName);
            if (construct)
                builder = this.CompInstance(srcParent, srcElm, atts, construct);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define': { // 'LET' staat de parser niet toe.
                        //srcParent.removeChild(srcElm);
                        const rvarName  = atts.get('rvar'),
                            varName     = rvarName || atts.get('let') || atts.get('var', true),
                            getStore    = rvarName && this.CompAttrExpr<Store>(atts, 'store'),
                            bAsync      = rvarName && CBool(atts.get('async')),
                            bReact      = CBool(atts.get('reacting') ?? atts.get('updating')),
                            getValue    = this.CompParameter(atts, 'value'),
                            newVar      = this.NewVar(varName),
                            subBuilder  = this.CompChildNodes(srcElm);

                        builder = async function DEF(this: RCompiler, area) {
                                const {range, subArea, bInit} = PrepArea(srcElm, area);
                                if (bInit || bReact){
                                    const value = getValue && getValue(area.env);
                                    if (rvarName) {
                                        const VV = bAsync ? undefined : value;
                                        if (bInit)
                                            range.value = new _RVAR(this.MainC, null, VV, getStore && getStore(area.env), rvarName);
                                        else
                                            range.value.V = VV;

                                        if (bAsync) {
                                            const rvar = range.value as RVAR;
                                            (value as Promise<unknown>).then(v => rvar.V = v);
                                        }
                                    } else
                                        range.value = value;
                                }
                                newVar(area.env)(range.value);
                                await subBuilder.call(this, subArea);
                                /*
                                if (bInit && rvar) {
                                //    (range.value as RVAR).Subscribe(new Subscriber(subArea, subBuilder, range.child));
                                    const a = area;
                                    envActions.push(() => {
                                        if (rvar.Subscribers.size == 0)
                                        rvar.Subscribe(new Subscriber(
                                            a, null, range.next
                                        ))
                                    })
                                }
                                */
                            };
                    } break;

                    case 'if':
                    case 'case': {
                        const bHiding = CBool(atts.get('hiding')),                         
                            getVal = this.CompAttrExpr<string>(atts, 'value'),
                            caseNodes: Array<{
                                node: HTMLElement,
                                atts: Atts,
                                body: Iterable<ChildNode>,
                            }> = [],
                            body: ChildNode[] = [];
                        let bThen = false;
                        
                        for (const node of srcElm.childNodes) {
                            if (node.nodeType == Node.ELEMENT_NODE) 
                                switch (node.nodeName) {
                                    case 'THEN':
                                        bThen = true;
                                        new Atts(node as HTMLElement).CheckNoAttsLeft();
                                        caseNodes.push({node: node as HTMLElement, atts, body: node.childNodes});
                                        continue;
                                    case 'ELSE':
                                    case 'WHEN':
                                        caseNodes.push({node: node as HTMLElement, atts: new Atts(node as HTMLElement), body: node.childNodes});
                                        continue;
                                }
                            body.push(node);
                        }
                        if (!bThen)
                            if (srcElm.nodeName == 'IF')
                                caseNodes.unshift({node: srcElm, atts, body});
                            else
                                atts.CheckNoAttsLeft();

                        const 
                            caseList: Array<{
                                cond?: Dependent<unknown>,
                                not?: boolean,
                                patt?: {lvars: LVar[], regex: RegExp, url?: boolean},
                                builder: DOMBuilder, 
                                node: HTMLElement,
                            }> = [],
                            bTrimLeft = this.whiteSpc;
                        
                        for (let {node, atts, body} of caseNodes) {
                            const saved = this.SaveContext();
                            this.whiteSpc = bTrimLeft;
                            try {
                                let cond: Dependent<unknown> = null, not: boolean = false;
                                let patt:  {lvars: LVar[], regex: RegExp, url?: boolean} = null;
                                switch (node.nodeName) {
                                    case 'WHEN':
                                    case 'IF':
                                    case 'THEN':
                                        cond = this.CompAttrExpr<unknown>(atts, 'cond');
                                        not = CBool(atts.get('not')) || false;
                                        let pattern: string;
                                        patt =
                                            (pattern = atts.get('match')) != null
                                                ? this.CompPattern(pattern)
                                            : (pattern = atts.get('urlmatch')) != null
                                                ? this.CompPattern(pattern, true)
                                            : (pattern = atts.get('regmatch')) != null
                                                ?  {regex: new RegExp(pattern, 'i'), 
                                                lvars: (atts.get('captures')?.split(',') || []).map(this.NewVar.bind(this))
                                                }
                                            : null;

                                        if (bHiding && patt?.lvars.length)
                                            throw `Pattern capturing cannot be combined with hiding`;
                                        if (patt && !getVal)
                                            throw `Match requested but no 'value' specified.`;

                                    // Fall through!
                                    case 'ELSE':
                                        const builder = this.CompChildNodes(node, body);
                                        caseList.push({cond, not, patt, builder, node});
                                        atts.CheckNoAttsLeft();
                                        continue;
                                }
                            } 
                            catch (err) { throw (node.nodeName=='IF' ? '' : OuterOpenTag(node)) + err; }
                            finally { this.RestoreContext(saved) }
                        }

                        builder = 
                            async function CASE(this: RCompiler, area: Area) {
                                const {env} = area,
                                    value = getVal && getVal(env);
                                let choosenAlt: typeof caseList[0] = null;
                                let matchResult: RegExpExecArray;
                                for (const alt of caseList)
                                    try {
                                        if ( !(
                                            (!alt.cond || alt.cond(env)) 
                                            && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))
                                            ) == alt.not)
                                        { choosenAlt = alt; break }
                                    } catch (err) { throw OuterOpenTag(alt.node) + err }
                                if (bHiding) {
                                    // In this CASE variant, all subtrees are kept in place, some are hidden
                                        
                                    for (const alt of caseList) {
                                        const {elmRange, childArea, bInit} = PrepareElement(alt.node, area);
                                        const bHidden = elmRange.node.hidden = alt != choosenAlt;
                                        if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                            await this.CallWithErrorHandling(alt.builder, alt.node, 
                                                childArea );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    const {subArea, bInit} = PrepArea(srcElm, area, '', 1, choosenAlt);
                                    if (choosenAlt && (bInit || !area.bNoChildBuilding)) {
                                        const saved = SaveEnv();
                                        try {
                                            if (choosenAlt.patt) {
                                                let i=1;
                                                for (const lvar of choosenAlt.patt.lvars)
                                                    lvar(env)(
                                                        (choosenAlt.patt.url ? decodeURIComponent : (r: string) => r)
                                                        (matchResult[i++])
                                                    );
                                            }
                                            await this.CallWithErrorHandling(choosenAlt.builder, choosenAlt.node, subArea );
                                        } finally { RestoreEnv(saved) }
                                    }
                                }
                        }
                        if (this.whiteSpc==WhiteSpc.trim) this.whiteSpc=WhiteSpc.keep
                    } break;
                            
                    case 'for':
                    case 'foreach':
                        builder = this.CompFor(srcParent, srcElm, atts);
                    break;
                        
                    case 'include': {
                        const src = atts.get('src', true);
                        // Placeholder that will contain a Template when the file has been received
                        let C: RCompiler = new RCompiler(this);
                        C.FilePath = this.GetPath(src);
                        
                        const task = (async () => {
                            const textContent = await this.FetchText(src);
                            // Parse the contents of the file
                            const parser = new DOMParser();
                            const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;

                            // Compile the parsed contents of the file in the original context
                            C.Compile(parsedContent.body, {bRunScripts: true}, false);
                        })();

                        builder = 
                            // Runtime routine
                            async function INCLUDE(this: RCompiler, area) {
                                const t0 = performance.now();
                                await task;
                                this.start += performance.now() - t0;
                                await C.Builder(area);
                                this.builtNodeCount += C.builtNodeCount;
                            };
                    } break;

                    case 'import': {
                        const src = this.GetURL(atts.get('src', true))
                        const listImports = new Array<Signature>();
                        
                        for (const child of srcElm.children) {
                            const sign = this.ParseSignature(child);
                            listImports.push(sign);
                            this.AddConstruct(sign);
                        }
                            
                        const C = new RCompiler();
                        C.FilePath = this.GetPath(src);
                        C.Settings.bRunScripts = true;
                
                        let promiseModule = RModules.get(src);
                        if (!promiseModule) {
                            promiseModule = this.FetchText(src)
                            .then(textContent => {
                                // Parse the contents of the file
                                const parser = new DOMParser(),
                                    parsedDoc = parser.parseFromString(textContent, 'text/html') as HTMLDocument,
                                    builder = C.CompIterator(null, 
                                        concIterable(parsedDoc.head.children, parsedDoc.body.children)
                                    );

                                for (const clientSig of listImports) {
                                    const signature = C.CSignatures.get(clientSig.name);
                                    if (!signature)
                                        throw `<${clientSig.name}> is missing in '${src}'`;
                                    if (!clientSig.IsCompatible(signature))
                                        throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signature.srcElm.outerHTML}`;
                                }
                                return builder
                            });
                            RModules.set(src, promiseModule);
                        }
                        
                        builder = async function IMPORT({env}: Area) {
                            const builder = await promiseModule, mEnv = NewEnv();
                            await builder.call(C, {parent: document.createDocumentFragment(), start: null, bInit: true, env: mEnv});

                            for (const {name} of listImports)
                                DefConstruct(env, name, mEnv.constructs.get(name));
                        }

                    } break;

                    case 'react': {
                        this.MainC.bHasReacts = true;
                        const getRvars = this.compAttrExprList<RVAR>(atts, 'on');
                        const getHashes = this.compAttrExprList<unknown>(atts, 'hash');

                        const bodyBuilder = this.CompChildNodes(srcElm);
                        
                        builder = this.GetREACT(srcElm, '', bodyBuilder, getRvars, CBool(atts.get('renew')));

                        if (getHashes) {
                            const b = builder;
                            builder = async function HASH(this: RCompiler, area: Area) {
                                const {subArea, range} = PrepArea(srcElm, area, 'hash');
                                const hashes = getHashes(area.env);

                                if (!range.value || hashes.some((hash, i) => hash !== range.value[i])) {
                                    range.value = hashes;
                                    await b.call(this, subArea);
                                }
                            }
                        }
                    } break;

                    case 'rhtml': {
                        this.whiteSpc=WhiteSpc.trim;
                        const bodyBuilder = this.CompChildNodes(srcElm);
                        //srcParent.removeChild(srcElm);

                        //const imports = this.CompAttrExpr(atts, 'imports');
                        const modifs = this.CompAttributes(atts);

                        builder = async function RHTML(this: RCompiler, area) {
                            const tempElm = document.createElement('rhtml');
                            await bodyBuilder.call(this, {parent: tempElm, env: area.env, range: null});
                            const result = tempElm.innerText
                            
                            const {elmRange, bInit} = PrepareElement<{hdrElms: ChildNode[]}>(srcElm, area, 'rhtml-rhtml'), 
                                elm = elmRange.node;
                            ApplyModifiers(elm, modifs, area.env, bInit);

                            if (area.prevR || result != elmRange.result) {
                                elmRange.result = result;
                                const shadowRoot = elm.shadowRoot || elm.attachShadow({mode: 'open'});

                                try {
                                    tempElm.innerHTML = result;
                                    if (elmRange.hdrElms) {
                                        for (const elm of elmRange.hdrElms) elm.remove();
                                        elmRange.hdrElms = null;
                                    }
                                    const R = new RCompiler();;
                                    (R.head = shadowRoot).innerHTML = '';
                                    R.Compile(tempElm, {bRunScripts: true, bTiming: this.Settings.bTiming}, false);
                                    elmRange.hdrElms = R.AddedHeaderElements;
                                    
                                    const subArea: Area = 
                                        {parent: shadowRoot, range: null, env: NewEnv(), parentR: new Range(null, 'Shadow')};
                                    /* R.StyleBefore = subArea.marker; */
                                    await R.InitialBuild(subArea);
                                    this.builtNodeCount += R.builtNodeCount;
                                }
                                catch(err) {
                                    shadowRoot.appendChild(createErrorNode(`Compile error: ${err}`))
                                }
                            }
                        };
                    } break;

                    case 'script': 
                        builder = this.CompScript(srcParent, srcElm as HTMLScriptElement, atts); break;

                    case 'style':
                        this.CompStyle(srcElm); break;

                    case 'component': 
                        builder = this.CompComponent(srcParent, srcElm, atts); break;

                    case 'document': {
                        const newVar = this.NewVar(atts.get('name', true)),
                            bEncaps = CBool(atts.get('encapsulate')),
                            params=atts.get('params'),
                            RC = this,
                            docBuilder = RC.CompChildNodes(srcElm),
                            docDef = (env: Environment) => {
                                env = CloneEnv(env);
                                return {
                                    render(parent: HTMLElement) {
                                        parent.innerHTML = '';
                                        return docBuilder.call(RC, {parent, env}); 
                                    },
                                    async open(...args: string[]) {
                                        const W = window.open('', ...args);
                                        // Copy all style sheet rules
                                        if (!bEncaps)
                                            copyStyleSheets(document, W.document);
                                        await this.render(W.document.body);
                                        return W;
                                    },
                                    async print() {
                                        const iframe = document.createElement('iframe');
                                        iframe.setAttribute('style','display:none');
                                        document.body.appendChild(iframe);
                                        if (!bEncaps)
                                            copyStyleSheets(document, iframe.contentDocument);
                                        await docBuilder.call(RC, {parent: iframe.contentDocument.body, env});
                                        iframe.contentWindow.print();
                                        iframe.remove();
                                    }
                                };
                            };
                        builder = async function DOCUMENT(this: RCompiler, {env}) {
                            newVar(env)(docDef(env));
                        }
                    }; break;

                    case 'head.': {
                        const childBuilder = this.CompChildNodes(srcElm);
                        
                        builder = async function HEAD(this: RCompiler, {parent, env}) {
                            const head = parent.ownerDocument.head;
                            await childBuilder.call(this, {parent: head, env})
                        }
                    }; break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        builder = this.CompHTMLElement(srcElm, atts); 
                        break labelNoCheck;
                }
                atts.CheckNoAttsLeft();
            }
        }
        catch (err) { 
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        if (!builder) return null;
        if (genMods.length) {
            const b = builder;
            builder = async function ON(this: RCompiler, area: Area) {
                const bInit = !area.range, handlers = genMods.map(({attName, handler}) => ({attName, handler: handler(area.env)}));
                const node = await b.call(this, area);
                for (const {attName, handler} of handlers)
                    if (bInit || attName=='onupdate')
                        handler.call(node);
            }
        }

        for (const {attName, rvars} of reacts)
            builder = this.GetREACT(srcElm, attName, builder, rvars);
        
        return [
            function Elm(this: RCompiler, area: Area) {
                return this.CallWithErrorHandling(builder, srcElm, area);
            }
            , srcElm];
    }

    private GetREACT(
        srcElm: HTMLElement, attName: string, 
        builder: DOMBuilder, 
        getRvars: Dependent<RVAR[]>, 
        bRenew=false
    ): DOMBuilder{
        this.MainC.bHasReacts = true;
        const  updateBuilder: DOMBuilder = 
            ( bRenew
                ? async function renew(this: RCompiler, subArea: Area) {
                    const subsubArea = PrepArea(srcElm, subArea, 'renew', 2).subArea;
                    await builder.call(this, subsubArea);
                }
            : attName == 'thisreactson'
                ? async function reacton(this: RCompiler, subArea: Area) {
                    subArea.bNoChildBuilding = true;
                    await builder.call(this, subArea);
                }
            : builder
            );

        return async function REACT(this: RCompiler, area) {
            const {range, subArea, bInit} = PrepArea(srcElm, area, attName, true)
            //    , {start} = this.MainC;
            // Avoid double updates
            //if (bInit || range.updated != start)
            if (bRenew) {
                const subsubArea = PrepArea(srcElm, subArea, 'renew', 2).subArea;
                await builder.call(this, subsubArea);
            }
            else
                await builder.call(this, subArea);            

            if (getRvars) {
                const rvars = getRvars(area.env);
                let subscriber: Subscriber, pVars: RVAR[];
                if (bInit)
                    subscriber = this.Subscriber(subArea, updateBuilder, range.child, );
                else {
                    ({subscriber, rvars: pVars} = range.value);
                    subscriber.sArea.env = CloneEnv(subArea.env);
                }
                range.value = {rvars, subscriber};
                let i=0;
                for (const rvar of rvars) {
                    if (pVars) {
                        const pvar = pVars[i++];
                        if (rvar==pvar)
                            continue;
                        pvar.Unsubscribe(subscriber);
                    }
                    try { rvar.Subscribe(subscriber); }
                    catch { throw "This is not an RVAR"; }
                }
            }
        }
    }

    private async CallWithErrorHandling(this: RCompiler, builder: DOMBuilder, srcNode: ChildNode, area: Area){
        let {range} = area;
        if (range && range.errorNode) {
            area.parent.removeChild(range.errorNode);
            range.errorNode = undefined;
        }
        try {
            //await builder(area);
            await builder.call(this, area);
        } 
        catch (err) { 
            const message = 
                srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode =
                    area.parent.insertBefore(createErrorNode(message), area.range?.First);
                if (range)
                    range.errorNode = errorNode;    /* */
            }
        }
    }

    private CompScript(this:RCompiler, srcParent: ParentNode, srcElm: HTMLScriptElement, atts: Atts) {
        //srcParent.removeChild(srcElm);
        const bModule = atts.get('type')?.toLowerCase() == 'module'
            , bNoModule = atts.get('nomodule') != null
            , defines = atts.get('defines');
        let src = atts.get('src');
        let builder: DOMBuilder;

        if ( bNoModule || this.Settings.bRunScripts) {
            let script = srcElm.text+'\n';
            const lvars: Array<{name: string,init: LVar}> = [];
            if (defines) 
                for (const name of defines.split(','))
                    lvars.push({name, init: this.NewVar(name)});
                
            let exports: Object;
            builder = async function SCRIPT(this: RCompiler, {env}: Area) {
                if (!(bModule || bNoModule || defines || !this.clone)) {
                    if (!exports) {
                        const e = srcElm.cloneNode(true) as HTMLScriptElement;
                        document.head.appendChild(e); // 
                        this.AddedHeaderElements.push(e);
                        exports = {};
                    }
                }
                else if (bModule) {
                    // Execute the script now
                    if (!exports) {
                        if (src) 
                            exports = await import(this.GetURL(src));
                        else
                            try {
                                script = script.replace(/(\sfrom\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => `${p1}${this.GetURL(p2)}${p3}`);
                                // Thanks https://stackoverflow.com/a/67359410/2061591
                                const src = URL.createObjectURL(new Blob([script], {type: 'application/javascript'}));
                                exports = await import(src);
                            }
                            finally { URL.revokeObjectURL(src); }
                    }
                    for (const {name, init} of lvars) {
                        if (!(name in exports))
                            throw `'${name}' is not exported by this script`;
                        init(env)(exports[name]);
                    }
                }
                else  {
                    if (!exports) {
                        if (src)
                            script = await this.FetchText(src);
                        exports = gEval(`'use strict'\n;${script};[${defines}]\n`) as Array<unknown>;
                    }
                    let i=0;
                    for (const {init} of lvars)
                        init(env)(exports[i++]);
                }
            };
        }
        else if (defines)
            throw `You must add 'nomodule' if this script has to define OtoReact variables`;
        atts.clear();
        return builder;
    }

    public CompFor(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, atts: Atts): DOMBuilder {
        const varName = atts.get('let') ?? atts.get('var');
        let indexName = atts.get('index');
        if (indexName == '') indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) { /* A regular iteration */
                let prevName = atts.get('previous');
                if (prevName == '') prevName = 'previous';
                let nextName = atts.get('next');
                if (nextName == '') nextName = 'next';
                
                const getRange = this.CompAttrExpr<Iterable<Item>>(atts, 'of', true),
                getUpdatesTo = this.CompAttrExpr<RVAR>(atts, 'updates'),
                bReactive = CBool(atts.get('updateable') ?? atts.get('reactive')) || !!getUpdatesTo,
            
                // Voeg de loop-variabele toe aan de context
                    initVar = this.NewVar(varName),
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                    initIndex = this.NewVar(indexName),
                    initPrevious = this.NewVar(prevName),
                    initNext = this.NewVar(nextName),

                    getKey = this.CompAttrExpr<Key>(atts, 'key'),
                    getHash = this.CompAttrExpr<Hash>(atts, 'hash'),

                // Compileer alle childNodes
                    bodyBuilder = this.CompChildNodes(srcElm);
                
                //srcParent.removeChild(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, area: Area) {
                    const {range, subArea} = PrepArea(srcElm, area, '', true),
                        {parent, env} = subArea,
                        savedEnv = SaveEnv();
                    try {
                        // Map of previous data, if any
                        const keyMap: Map<Key, Range> = range.value ||= new Map(),
                        // Map of the newly obtained data
                            newMap: Map<Key, {item:Item, hash:Hash, idx: number}> = new Map(),
                            setVar = initVar(env),

                            iterable = getRange(env),
                            setIndex = initIndex(env);
                        if (iterable) {
                            if (!(iterable[Symbol.iterator] || iterable[Symbol.asyncIterator]))
                                throw `[of]: Value (${iterable}) is not iterable`;
                            let idx=0;
                            for await (const item of iterable) {
                                setVar(item);
                                setIndex(idx);
                                const hash = getHash && getHash(env);
                                const key = getKey ? getKey(env) : hash;
                                if (key != null && newMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                newMap.set(key ?? {}, {item, hash, idx});
                                idx++;
                            }
                        }

                        let nextChild = range.child;

                        const setPrevious = initPrevious(env),
                            setNext = initNext(env),
                            iterator = newMap.entries(),
                            nextIterator = nextName ? newMap.values() : null;

                        let prevItem: Item = null, nextItem: Item
                            , prevRange: Range = null,
                            childArea: Area;
                        subArea.parentR = range;

                        if (nextIterator) nextIterator.next();

                        while(true) {
                            let k: Key;
                            while (nextChild && !newMap.has(k = nextChild.key)) {
                                if (k != null)
                                    keyMap.delete(k);
                                try {
                                    for (const node of nextChild.Nodes())
                                        parent.removeChild(node);
                                } catch {}
                                nextChild.prev = null;
                                nextChild = nextChild.next;
                            }

                            const {value} = iterator.next();
                            if (!value) break;
                            const [key, {item, hash, idx}] = value;

                            if (nextIterator)
                                nextItem = nextIterator.next().value?.item;

                            let childRange = keyMap.get(key), bInit = !childRange;
                            if (bInit) {
                                // Item has to be newly created
                                subArea.range = null;
                                subArea.prevR = prevRange;
                                subArea.before = nextChild?.First as Comment || range.endMark;
                                ;({range: childRange, subArea: childArea} = PrepArea(null, subArea, `${varName}(${idx})`, true));
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, childRange);
                                }
                                childRange.key = key;
                            }
                            else {
                                // Item already occurs in the series
                                
                                if (childRange.fragm) {
                                    const nextNode = nextChild?.First || range.endMark;
                                    parent.insertBefore(childRange.fragm, nextNode);
                                    childRange.fragm = null;
                                }
                                else
                                    while (true) {
                                        if (nextChild == childRange)
                                            nextChild = nextChild.next;
                                        else {
                                            // Item has to be moved
                                            const nextIndex = newMap.get(nextChild.key)?.idx;
                                            if (nextIndex > idx + 2) {
                                                const fragm = nextChild.fragm = document.createDocumentFragment();
                                                for (const node of nextChild.Nodes())
                                                    fragm.appendChild(node);
                                                
                                                nextChild = nextChild.next;
                                                continue;
                                            }

                                            childRange.prev.next = childRange.next;
                                            if (childRange.next)
                                                childRange.next.prev = childRange.prev;
                                            const nextNode = nextChild?.First || range.endMark;
                                            for (const node of childRange.Nodes())
                                                parent.insertBefore(node, nextNode);
                                        }
                                        break;
                                    }

                                childRange.text = `${varName}(${idx})`;

                                if (prevRange) 
                                    prevRange.next = childRange;
                                else
                                    range.child = childRange;
                                subArea.range = childRange;
                                childArea = PrepArea(null, subArea, '', true).subArea;
                                subArea.parentR = null;
                            }
                            childRange.prev = prevRange;
                            prevRange = childRange;

                            if (hash == null
                                ||  hash != childRange.hash as Hash
                                    && (childRange.hash = hash, true)
                            ) {
                                // Environment instellen
                                let rvar: RVAR_Light<Item>;

                                if (bReactive) {
                                    if (item === childRange.rvar)
                                        rvar = item;
                                    else {
                                        rvar = this.RVAR_Light(item as object, getUpdatesTo && [getUpdatesTo(env)])
                                        if (childRange.rvar)
                                            rvar._Subscribers = childRange.rvar._Subscribers 
                                    }
                                }
                                
                                setVar(rvar || item);
                                setIndex(idx);
                                setPrevious(prevItem);
                                if (nextIterator)
                                    setNext(nextItem)

                                // Body berekenen
                                await bodyBuilder.call(this, childArea);

                                if (rvar && !childRange.rvar)
                                    rvar.Subscribe(
                                        this.Subscriber(childArea, bodyBuilder, childRange.child)
                                    );
                                childRange.rvar = rvar
                            }

                            prevItem = item;
                        }
                        if (prevRange) prevRange.next = null; else range.child = null;
                    }
                    finally { RestoreEnv(savedEnv) }
                };
            }
            else { 
                /* Iterate over multiple slot instances */
                const slotName = atts.get('of', true, true).toLowerCase();
                const slot = this.CSignatures.get(slotName)
                if (!slot)
                    throw `Missing attribute [let]`;

                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompChildNodes(srcElm);
                //srcParent.removeChild(srcElm);

                return async function FOREACH_Slot(this: RCompiler, area: Area) {
                    const {subArea} = PrepArea(srcElm, area);
                    const env = subArea.env;
                    const saved= SaveEnv();
                    const slotDef = env.constructs.get(slotName);
                    try {
                        const setIndex = initIndex(area.env);
                        let index = 0;
                        for (const slotBuilder of slotDef.templates) {
                            setIndex(index++);
                            env.constructs.set(slotName, {templates: [slotBuilder], constructEnv: slotDef.constructEnv});
                            await bodyBuilder.call(this, subArea);
                        }
                    }
                    finally {
                        env.constructs.set(slotName, slotDef);
                        RestoreEnv(saved);
                    }
                }
            }
        }
        finally { this.RestoreContext(saved) }
    }

    private ParseSignature(elmSignature: Element):  Signature {
        const signature = new Signature(elmSignature);
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
                        ? (m[1] == '#' ? this.CompJavaScript(attr.value, attr.name) :  this.CompString(attr.value, attr.name))
                        : m[3] ? (_) => undefined
                        : null 
                    }
                );
            }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.localName, this.ParseSignature(elmSlot));
        return signature;
    }

    private CompComponent(srcParent: ParentNode, srcElm: HTMLElement, atts: Atts): DOMBuilder {
        //srcParent.removeChild(srcElm);

        const builders: [DOMBuilder, ChildNode][] = [],
            bEncaps = CBool(atts.get('encapsulate')),
            styles: Node[] = [],
            saveWS = this.whiteSpc;
        let signature: Signature, elmTemplate: HTMLTemplateElement;

        for (const srcChild of Array.from(srcElm.children) as Array<HTMLElement>  ) {
            const childAtts = new Atts(srcChild);
            let builder: DOMBuilder;
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    builder = this.CompScript(srcElm, srcChild as HTMLScriptElement, childAtts);
                    break;
                case 'STYLE':
                    if (bEncaps)
                        styles.push(srcChild);
                    else
                        this.CompStyle(srcChild);
                    
                    break;
                case 'TEMPLATE':
                    if (elmTemplate) throw 'Double <TEMPLATE>';
                    elmTemplate = srcChild as HTMLTemplateElement;
                    break;
                default:
                    if (signature) throw `Illegal component element <${srcChild.nodeName}>`;
                    signature = this.ParseSignature(srcChild);
                    break;
            }
            if (builder) builders.push([builder, srcChild]);
        }
        if (!signature) throw `Missing signature`;
        if (!elmTemplate) throw 'Missing <TEMPLATE>';

        if (bEncaps && !signature.RestParam)
            signature.RestParam = {name: null, pDefault: null}
        this.AddConstruct(signature);
        
        
        const {name} = signature,
        // Deze builder bouwt de component-instances op
            templates = [
                this.CompTemplate(signature, elmTemplate.content, elmTemplate, 
                    false, bEncaps, styles)
            ];

        this.whiteSpc = saveWS;

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return async function COMPONENT(this: RCompiler, area: Area) {
                for (const [bldr, srcNode] of builders)
                    await this.CallWithErrorHandling(bldr, srcNode, area);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs

                const construct: ConstructDef = {templates, constructEnv: undefined as Environment};
                DefConstruct(area.env, name, construct);
                construct.constructEnv = CloneEnv(area.env);     // Contains circular reference to construct
            };
    }

    private CompTemplate(signat: Signature, contentNode: ParentNode, srcElm: HTMLElement, 
        bNewNames: boolean, bEncaps?: boolean, styles?: Node[], atts?: Atts
    ): Template
    {
        const names: string[] = [], 
            saved = this.SaveContext(),
            bCheckAtts = !atts;
        try {
            if (bCheckAtts)
                atts = new Atts(srcElm);
            for (const param of signat.Parameters)
                names.push( (atts.get(`#${param.name}`) ?? atts.get(param.name, bNewNames)) || param.name);
            const {name, RestParam} = signat;
            if (RestParam?.name)
                names.push( atts.get(`...${RestParam.name}`, bNewNames) || RestParam.name);

            for (const S of signat.Slots.values())
                this.AddConstruct(S);
            if (bCheckAtts)
                atts.CheckNoAttsLeft();

            const lvars: LVar[] = names.map(name => this.NewVar(name)),
                builder = this.CompChildNodes(contentNode),
                customName = /^[A-Z].*-/.test(name) ? name : `rhtml-${name}`;

            return async function TEMPLATE(this: RCompiler
                , area: Area, args: unknown[], mSlotTemplates, slotEnv
                ) {
                const saved = SaveEnv(),
                    {env} = area;
                try {
                    for (const [slotName, instanceBuilders] of mSlotTemplates)
                        DefConstruct(env, slotName, {templates: instanceBuilders, constructEnv: slotEnv});
                    
                    let i = 0;
                    for (const lvar of lvars){
                        let arg = args[i], dflt: Dependent<unknown>;
                        if (arg===undefined && (dflt = signat.Parameters[i].pDefault))
                            arg = dflt(env);
                        lvar(env)(arg);
                        i++;
                    }

                    if (bEncaps) {
                        const {elmRange, childArea, bInit} = PrepareElement(srcElm, area, customName), 
                            elm = elmRange.node,
                            shadow = elm.shadowRoot || elm.attachShadow({mode: 'open'});
                        if (bInit)
                            for (const style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        
                        if (args[i])
                            ApplyModifier(elm, ModType.RestArgument, null, args[i], bInit);
                        childArea.parent = shadow;
                        area = childArea;
                    }
                    await builder.call(this, area); 
                }
                finally { RestoreEnv(saved) }
            }
        }
        catch (err) {throw `${OuterOpenTag(srcElm)} template: ${err}` }
        finally { this.RestoreContext(saved) }
    }


    private CompInstance(
        srcParent: ParentNode, srcElm: HTMLElement, atts: Atts,
        signature: Signature
    ) {
        //srcParent.removeChild(srcElm);
        const {name} = signature,
            getArgs: Array<Dependent<unknown>> = [],
            slotBuilders = new Map<string, Template[]>();

        for (const {name, pDefault} of signature.Parameters)
            getArgs.push( this.CompParameter(atts, name, !pDefault) );

        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);

        let slotElm: HTMLElement, Slot: Signature;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE 
                && (Slot = signature.Slots.get((slotElm = (node as HTMLElement)).localName))
                && slotElm.localName != 'content'
            ) {
                slotBuilders.get(slotElm.localName).push(
                    this.CompTemplate(Slot, slotElm, slotElm, true)
                );
                srcElm.removeChild(node);
            }
        
        const contentSlot = signature.Slots.get('content');
        if (contentSlot)
            slotBuilders.get('content').push(
                this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts)
            );

        const modifs = signature.RestParam ? this.CompAttributes(atts): null;

        atts.CheckNoAttsLeft();
        this.whiteSpc = WhiteSpc.keep;

        return async function INSTANCE(this: RCompiler, area: Area) {
            const {env} = area,
                cdef = env.constructs.get(name),
                {subArea} = PrepArea(srcElm, area),
                args: unknown[] = [];
            if (!cdef) return;
            for ( const getArg of getArgs)
                args.push(getArg ? getArg(env) : undefined);
            
            if (signature.RestParam) {
                const rest: RestParameter = [];
                for (const {modType, name, depValue} of modifs)
                    rest.push({modType, name, value: depValue(env)})
                
                args.push(rest);
            }

            subArea.env = cdef.constructEnv;
            for (const parBuilder of cdef.templates) 
                await parBuilder.call(this, subArea, args, slotBuilders, env);
        }
    }

    static regTrimmable = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select)$/;
    private CompHTMLElement(srcElm: HTMLElement, atts: Atts) {
        // Remove trailing dots
        const name = srcElm.localName.replace(/\.+$/, ''), saveWs = this.whiteSpc;
        const ws: WhiteSpc = 
            this.mPreformatted.has(name) ? WhiteSpc.preserve : RCompiler.regTrimmable.test(name) ? WhiteSpc.trim : WhiteSpc.keep;

        // We turn each given attribute into a modifier on created elements
        const modifs = this.CompAttributes(atts);

        if (ws != WhiteSpc.keep) this.whiteSpc = ws;
        // Compile the given childnodes into a routine that builds the actual childnodes
        const childnodesBuilder = this.CompChildNodes(srcElm);
        if (ws == WhiteSpc.trim) this.whiteSpc = ws;
        else if (ws == WhiteSpc.preserve && saveWs!=WhiteSpc.preserve) this.whiteSpc = WhiteSpc.keep;

        // Now the runtime action
        const builder: DOMBuilder = async function ELEMENT(this: RCompiler, area: Area) {
            const {elmRange: {node}, childArea, bInit} = PrepareElement(srcElm, area, name);
            
            if (!area.bNoChildBuilding)
                // Build children
                await childnodesBuilder.call(this, childArea);

            node.removeAttribute('class');
            if ((node as any).handlers) {
                for (const {evType, listener} of (node as any).handlers)
                    node.removeEventListener(evType, listener);
                }
            (node as any).handlers = [];
            ApplyModifiers(node, modifs, area.env, bInit);
            return node;
        };

        builder.ws = ws;
        return builder;
    }

    private CompAttributes(atts: Atts) { 
        const modifs: Array<Modifier> = [];

        for (const [attName, attValue] of atts) {
            let m: RegExpExecArray;
            try {
                if (m = /^on(.*)$/i.exec(attName))               // Events
                    modifs.push({
                        modType: ModType.Event, 
                        name: CapitalProp(m[0]), 
                        depValue: this.CompHandler(attName, attValue)
                    });
                else if (m = /^#class[:.](.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Class, name: m[1],
                        depValue: this.CompJavaScript<boolean>(attValue, attName)
                    });
                else if (m = /^#style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Style, name: CapitalProp(m[1]),
                        depValue: this.CompJavaScript<unknown>(attValue, attName)
                    });
                else if (m = /^style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Style, name: CapitalProp(m[1]),
                        depValue: this.CompString(attValue)
                    });
                else if (attName == '+style')
                    modifs.push({
                        modType: ModType.AddToStyle, name: null,
                        depValue: this.CompJavaScript<object>(attValue, attName)
                    });
                else if (m = /^#(.*)/.exec(attName))
                    modifs.push({
                        modType: ModType.Prop, 
                        name: CapitalProp(m[1]),
                        depValue: this.CompJavaScript<unknown>(attValue, attName)
                    });
                else if (attName == "+class")
                    modifs.push({
                        modType: ModType.AddToClassList, name: null,
                        depValue: this.CompJavaScript<object>(attValue, attName)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attName)) { // *, **, @, @@
                    const propName = CapitalProp(m[3]);                    
                    try {
                        const setter = this.CompJavaScript<Handler>(
                            `function(){const ORx=this.${propName};if(${attValue}!==ORx)${attValue}=ORx}`, attName);
                        modifs.push(
                            m[1] == '@'
                            ? { modType: ModType.Prop, name: propName, depValue: this.CompJavaScript<unknown>(attValue, attName) }
                            : { modType: ModType.oncreate, name: 'oncreate', depValue: setter });
                        modifs.push({modType: ModType.Event, name: m[2] ? 'onchange' : 'oninput', depValue: setter});
                    }
                    catch(err) { throw `Invalid left-hand side '${attValue}'`}
                }
                else if (m = /^\.\.\.(.*)/.exec(attName)) {
                    if (attValue) throw `Rest parameter cannot have a value`;
                    modifs.push({
                        modType: ModType.RestArgument, name: null,
                        depValue: this.CompName(m[1])
                    });
                }
                else if (attName == 'src')
                    modifs.push({
                        modType: ModType.Src,
                        name: this.FilePath,
                        depValue: this.CompString(attValue),
                    });
                else
                    modifs.push({
                        modType: ModType.Attr,
                        name: attName,
                        depValue: this.CompString(attValue)
                    });
            }
            catch (err) {
                throw(`[${attName}]: ${err}`)
            }
        }
        atts.clear();
        return modifs;
    }

    private CompStyle(srcStyle: HTMLElement)  {
        this.head.appendChild(srcStyle);
        this.AddedHeaderElements.push(srcStyle);
    }

    private regIS: RegExp;
    private CompString(data: string, name?: string): Dependent<string> & {fixed?: string; last?: string} {
        const 
            regIS = this.regIS ||= 
                new RegExp(
                    /(?<![\\$])/.source
                    + (this.Settings.bDollarRequired ? '\\$' : '\\$?')
                    + /\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/.source
                    , 'gs'
                ),
            generators: Array< string | Dependent<unknown> > = [];
        let isTrivial = true, last = '', bThis = false;
        regIS.lastIndex = 0;

        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data)
                , fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed)
                generators.push( last = fixed.replace(/\\([${}\\])/g, '$1') );  // Replace '\{' etc by '{'
            if (m[1]) {
                const getS = this.CompJavaScript<string>(m[1], name, '{}');
                generators.push( getS );
                isTrivial = false;
                last = '';
                bThis ||= getS.bThis;
            }
        }
        
        let dep: Dependent<string> & {fixed?: string; last?: string};
        if (isTrivial) {
            const result = (generators as Array<string>).join('');
            dep = () => result;
            dep.fixed = result
        } else
            dep = true ?
                function(this: HTMLElement, env: Environment) {
                    try {
                        let result = "";
                        for (const gen of generators)
                            result += typeof gen == 'string' ? gen : gen.call(this,env) ?? '';
                        return result;
                    }
                    catch (err) { throw name ? `[${name}]: ${err}` : err }
                }
            :   (env: Environment) => {
                try {
                    let result = "";
                    for (const gen of generators)
                        result += typeof gen == 'string' ? gen : gen(env) ?? '';
                    return result;
                }
                catch (err) { throw name ? `[${name}]: ${err}` : err }
            };
        dep.bThis = bThis;
        dep.last = last;
        return dep;
    }

    // Compile a 'regular pattern' into a RegExp and a list of bound LVars
    private CompPattern(patt:string, url?: boolean): {lvars: LVar[], regex: RegExp, url: boolean}
    {
        let reg = '', lvars: LVar[] = [];
        
        // These are the subpatterns that are need converting; all remaining characters are literals and will be quoted when needed
        const regIS =
            /(?<![\\$])\$?\{(.*?)(?<!\\)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;

        while (regIS.lastIndex < patt.length) {
            const lastIndex = regIS.lastIndex
            const m = regIS.exec(patt);
            const literals = patt.substring(lastIndex, m.index);

            if (literals)
                reg += quoteReg(literals);
            if (m[1]) {     // A capturing group
                reg += `(.*?)`;
                lvars.push(this.NewVar(m[1]));
            }
            else if (m[0] == '?')
                reg += '.';
            else if (m[0] == '*')
                reg += '.*';
            else if (m[2])  // An escaped character
                reg += m[2]
            else            // A character class
                reg += m[0];
        }

        return {lvars, regex: new RegExp(`^${reg}$`, 'i'), url}; 
    }

    private CompParameter(atts: Atts, attName: string, bRequired?: boolean): Dependent<unknown> {
        const value = atts.get(attName);
        return (
            value == null ? this.CompAttrExpr(atts, attName, bRequired)
            : /^on/.test(attName) ? this.CompHandler(attName, value)
            : this.CompString(value, attName)
        );
    }
    private CompAttrExpr<T>(atts: Atts, attName: string, bRequired?: boolean) {
        return this.CompJavaScript<T>(atts.get(attName, bRequired, true),attName);
    }

    private CompHandler(name: string, text: string) {
        return this.CompJavaScript<Handler>(`function ${name}(event){${text}\n}`, name)
    }
    private CompJavaScript<T>(
        expr: string           // Expression to transform into a function
        , descript?: string             // To be inserted in an errormessage
        , delims: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
    ): Dependent<T> {
        if (expr == null) return null;

        const bThis = /\bthis\b/.test(expr),
            depExpr = bThis ?
                `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
                : `'use strict';([${this.context}])=>(${expr}\n)`
            , errorInfo = `${descript ? `[${descript}] ` : ''}${delims[0]}${Abbreviate(expr,60)}${delims[1]}: `;

        try {
            const routine = gEval(depExpr) as (env:Environment) => T
            , depValue = (bThis
                ? function (this: HTMLElement, env: Environment) {
                        try { return routine.call(this, env); } 
                        catch (err) { throw errorInfo + err; }
                    }
                : (env: Environment) => {
                        try { return routine(env); } 
                        catch (err) { throw errorInfo + err; }
                    }
                ) as Dependent<T>;
            depValue.bThis = bThis;
            return depValue;
        }
        catch (err) { throw errorInfo + err }             // Compiletime error
    }
    private CompName(name: string): Dependent<unknown> {
        const i = this.ContextMap.get(name);
        if (i === undefined) throw `Unknown name '${name}'`;
        return env => env[i];
    }
    private compAttrExprList<T>(atts: Atts, attName: string, bRequired?: boolean): Dependent<T[]> {
        const list = atts.get(attName, bRequired, true);
        return list ? this.CompJavaScript<T[]>(`[${list}\n]`, attName) : null;
    }

    private GetURL(src: string) {
        return new URL(src, this.FilePath).href
    }
    private GetPath(src: string) {
        return this.GetURL(src).replace(/[^/]*$/, '');
    }

    async FetchText(src: string): Promise<string> {
        const url = this.GetURL(src),
            response = await gFetch(url);
        if (!response.ok)
            throw `GET '${url}' returned ${response.status} ${response.statusText}`;
        return await response.text();
    }
}


function quoteReg(fixed: string) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}

interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
class _RVAR<T = unknown>{
    constructor(
        private MainC: RCompiler,
        globalName?: string, 
        initialValue?: T, 
        private store?: Store,
        private storeName?: string,
    ) {
        if (globalName) globalThis[globalName] = this;
        
        let s: string;
        if ((s = store && store.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch{}
        this._Value = initialValue;
        this.storeName ||= globalName;
    }
    // The value of the variable
    private _Value: T;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    Subscribers: Set<Subscriber> = new Set();

    Subscribe(s: Subscriber, bImmediate?: boolean) {
        if (bImmediate) {
            s();
            s.bImm = bImmediate;
        }
        if (!s.ref)
            s.ref = {isConnected: true};
        this.Subscribers.add(s);
    }
    Unsubscribe(s: Subscriber) {
        this.Subscribers.delete(s);
    }

    // Use var.V to get or set its value
    get V() { return this._Value }
    // When setting, it will be marked dirty.
    set V(t: T) {
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
        }
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { 
        if (!bReadOnly) this.SetDirty();  
        return this._Value }
    set U(t: T) { this._Value = t; this.SetDirty(); }

    public SetDirty() {
        if (this.store)
            this.MainC.DirtyVars.add(this);
        for (const sub of this.Subscribers)
            if (sub.bImm)
                sub();
            else if (sub.ref.isConnected)
                this.MainC.AddDirty(sub);
            else
                this.Subscribers.delete(sub);
        this.MainC.RUpdate();
    }

    public Save() {
        this.store.setItem(`RVAR_${this.storeName}`, JSON.stringify(this._Value));
    }
}
export interface RVAR<T = unknown> extends _RVAR<T> {}

class Atts extends Map<string,string> {
    constructor(elm: HTMLElement) {
        super();
        for (const att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }

    public get(name: string, bRequired?: boolean, bHashAllowed?: boolean) {
        let n = name, value = super.get(n);
        if (value==null && bHashAllowed) {
            n = `#${name}`;
            value = super.get(n);
        }
        if (value != null)
            super.delete(n);
        else if (bRequired)
            throw `Missing attribute [${name}]`;
        return value;
    }

    public CheckNoAttsLeft() {  
        if (super.size)
            throw `Unknown attribute${super.size > 1 ? 's' : ''}: ${Array.from(super.keys()).join(',')}`;
    }
}

const regIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/
    , regReserved = /^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/;

function CheckValidIdentifier(name: string) {
    // Anders moet het een geldige JavaScript identifier zijn
    name = name.trim();
    if (!regIdentifier.test(name) )
        throw `Invalid identifier '${name}'`;
    if (regReserved.test(name))
        throw `Reserved keyword '${name}'`;
    return name;
}

// Capitalization of property names
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
const words = '(?:align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
+ '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|line|margin|max|min|node|offset|outer'
+ '|outline|overflow|owner|padding|parent|read|right|size|rule|scroll|selected|table|tab(?=index)|text|top|value|variant)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalProp(lcName: string) {
    return lcName.replace(regCapitalize, (char) => char.toUpperCase());
}

function OuterOpenTag(elm: HTMLElement, maxLength?: number): string {
    return Abbreviate(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLength-1) + '>';
}
function Abbreviate(s: string, maxLength: number) {
    return (maxLength && s.length > maxLength
        ? s.substr(0, maxLength - 3) + "..."
        : s);
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

function* concIterable<T>(R: Iterable<T>, S:Iterable<T>)  {
    for (const x of R) yield x;
    for (const x of S) yield x;
}

//function thrower(err: string = 'Internal error'): never { throw err }

function createErrorNode(message: string) {
    const node = document.createElement('div');        
    node.style.color = 'crimson';
    node.style.fontFamily = 'sans-serif';
    node.style.fontSize = '10pt';
    node.innerText = message;
    return node;
}

function copyStyleSheets(S: Document, D: Document) {
    for (const SSheet of S.styleSheets) {
        const DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (const rule of SSheet.cssRules) 
            DSheet.insertRule(rule.cssText);
    }
}

export let RHTML = new RCompiler();

Object.defineProperties(
    globalThis, {
        RVAR:       {get: () => RHTML.RVAR.bind(RHTML)},
        RUpdate:    {get: () => RHTML.RUpdate.bind(RHTML)},
    }
);
globalThis.RCompile = RCompile;
globalThis.RBuild = RBuild;
export const 
    RVAR = globalThis.RVAR as <T>(name?: string, initialValue?: T, store?: Store) => RVAR<T>, 
    RUpdate = globalThis.RUpdate as () => void;

const _range = globalThis.range = function* range(from: number, upto?: number, step: number = 1) {
	if (upto === undefined) {
		upto = from;
		from = 0;
	}
	for (let i= from; i<upto; i += step)
		yield i;
}
export {_range as range};

export const docLocation: RVAR<string> & {subpath?: string; searchParams?: URLSearchParams}
    = RVAR<string>('docLocation', location.href);
Object.defineProperty(docLocation, 'subpath', {get: () => location.pathname.substr(RootPath.length)});

window.addEventListener('popstate', () => {docLocation.V = location.href;} );

function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substr(1))?.scrollIntoView()), 6);
}
docLocation.Subscribe( () => {
    if (docLocation.V != location.href)
        history.pushState(null, null, docLocation.V);
    ScrollToHash();;
}, true);

export const reroute = globalThis.reroute = 
(arg: MouseEvent | string) => {
    if (typeof arg=='string')
        docLocation.V = arg;
    else if (!arg.ctrlKey) {
        docLocation.V = (arg.target as HTMLAnchorElement).href;
        arg.preventDefault();
    }
}