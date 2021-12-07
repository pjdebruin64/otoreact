// Global settings
const defaultSettings = {
    bTiming:        false,
    bAbortOnError:  false,  // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    true,   // Show runtime errors as text in the DOM output
    bRunScripts:    false,
    bBuild:         true,
    basePattern:    '/',
    preformatted:   [],
    bNoGlobals:     false,
    bDollarRequired: false,
    bSetPointer:    true,
    bKeepWhiteSpace: false,
    bKeepComments:  false,
}

// A DOMBUILDER is the semantics of a piece of RHTML.
// It can both build (construct) a new piece of DOM, and update an existing piece of DOM.
type DOMBuilder = ((reg: Area) => Promise<void>) & {ws?: boolean; auto?: boolean};
enum WSpc {block = 1, inlineSpc, inline, preserve}

// An AREA is the (runtime) place to build or update, with all required information
type Area = {
    range?: Range,              // Existing piece of DOM
    parent: Node;               // DOM parent node
    env: Environment;
    before?: ChildNode;

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
    parentR?: Range;

    /* For a range corresponding to a DOM node, the child ranges will correspond to child nodes of the DOM node.
    */

    constructor(
        public node: NodeType,     // Corresponding DOM node, if any
        area: Area,
        public text?: string,       // Description, used only for comments
    ) {
        if (!node) this.child = null;
        if (area && !area.parentR?.node)
            this.parentR = area.parentR;
    }
    toString() { return this.text || this.node?.nodeName; }

    result?: any;
    value?: any;
    errorNode?: ChildNode;
    erased?: boolean;

    // Only for FOR-iteraties
    hash?: Hash; key?: Key; prev?: Range;
    fragm?: DocumentFragment;
    rvar?: RVAR_Light<Item>;
    subs?: Subscriber<Item>;

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
        return null;
    }
    
    public get Next(): ChildNode {
        let r: Range = this, n: ChildNode, p: Range;
        do {
            p = r.parentR;
            while (r = r.next)
                if (n = r.First)
                    return n;
        } while (r = p)
        return null;
    }
    public get FirstOrNext() {
        return this.First || this.Next;
    }

    // Enumerate all DOM nodes within this range, not including their children
    Nodes(): Generator<ChildNode> { 
        return (function* Nodes(r: Range) {
            if (r.node)
                yield r.node;
            else {
                let {child} = r;
                while (child) {
                    yield* Nodes(child as Range);
                    child = child.next;
                }
            }
        })(this)
    }

    erase(parent: Node) {
        if (this.node)
            parent.removeChild(this.node);
        else {
            let {child} = this;
            this.child = null;
            while (child) {
                child.erase(parent);
                child.erased = true;
                child.parentR = null;
                child = child.next;
            }
        }
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
const DUndef: Dependent<any> = _ => undefined;

function PrepArea(srcElm: HTMLElement, area: Area, text: string = '',
    bMark?: boolean|1|2,  // true=mark area, no wiping; 1=wipe when result has changed; 2=wipe always
    result?: any,
) : {range: Range, subArea:Area, bInit: boolean}
{
    let {parent, env, range, before} = area,
        subArea: Area = {parent, env, range: null }
        , bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        subArea.before = area.before;
        if (srcElm) text = `${srcElm.localName}${text?' ':''}${text}`;
        
        UpdatePrevArea(area, range = subArea.parentR = new Range(null, area, text));
        range.result = result;
    }
    else {
        subArea.range = range.child;
        area.range = range.next;

        if (bMark) {
            if (bMark==1 && result != range.result || bMark==2) {
                range.result = result;
                range.erase(parent);                 
                range.child = null;
                subArea.range = null;
                subArea.before = range.Next;
                subArea.parentR = range;
                bInit = true;
            }
        }
    }
    
    return {range, subArea, bInit};
}
function UpdatePrevArea(area: Area, range: Range) {
    let r: Range
    if (r = area.prevR) 
        r.next = range;
    else if (r = area.parentR)
        r.child = range;

    area.prevR = range;
}

function PrepareElement<T={}>(srcElm: HTMLElement, area: Area, nodeName = srcElm.nodeName): 
    {range: Range<HTMLElement> & T, childArea: Area, bInit: boolean} {
    let range = area.range as Range<HTMLElement> & T, bInit = !range;
    if (bInit) {
        const elm: HTMLElement =
            ( area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore<HTMLElement>(document.createElement(nodeName), area.before)
            );
        range = new Range(elm, area) as Range<HTMLElement> & T;
        UpdatePrevArea(area, range);
    }
    else {
        area.range = range.next
    }
    return { range, 
            childArea: {parent: range.node, range: range.child, 
            before: null,
            env: area.env, 
            parentR: range
        },
        bInit};
}

function PrepCharData(area: Area, content: string, bComm?: boolean) {
    let range = area.range as Range<CharacterData>;
    if (!range) {
        range = new Range(
            area.parent.insertBefore(
                bComm ? document.createComment(content) : document.createTextNode(content)
                , area.before)
            , area
        );
        UpdatePrevArea(area, range);
    } else {
        range.node.data = content;
        area.range = range.next;
    }
}

type FullSettings = typeof defaultSettings;
type Settings = Partial<FullSettings>;
let BasePath: string = null;
let ToBuild: Area[] = [];

export function RCompile(elm: HTMLElement, settings?: Settings): Promise<void> { 
    try {
        const {basePattern} = R.Settings = {...defaultSettings, ...settings},
            m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (
            globalThis.BasePath = globalThis.BasePath = BasePath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : ''
        )
        R.RootElm = elm;
        R.Compile(elm, {}, true);
        ToBuild.push({parent: elm.parentElement, env: NewEnv(), source: elm, range: null});

        return (R.Settings.bBuild
            ? RBuild()
            : null);
    }
    catch (err) {
        window.alert(`OtoReact error: ${err}`);
    }
}

export async function RBuild() {
    R.start = performance.now();
    R.builtNodeCount = 0;
    try {
        for (const area of ToBuild)
            await R.InitialBuild(area);
        R.logTime(`Built ${R.builtNodeCount} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        window.alert(`OtoReact error: ${err}`);
    }
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
function assignEnv(target: Environment, source: Environment) {
    //const {constructs} = target;
    Object.assign(target, source);
    /*
    target.constructs = constructs;
    for (const [key,val] of source.constructs.entries())
        constructs.set(key, val);
    */
}

type Subscriber<T = unknown> = ((t?: T) => (void|Promise<void>)) &
    {   ref?: {};
        sArea?: Area;
        bImm?: boolean
    };

type ParentNode = HTMLElement|DocumentFragment;


type Handler = (ev:Event) => any;
type LVar = ((env: Environment) => (value: unknown) => void) & {varName: string};

// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {mode: string, name: string, pDefault: Dependent<unknown>};
// A SIGNATURE describes an RHTML user construct: a component or a slot
class Signature {
    constructor(public srcElm: Element){ 
        this.name = srcElm.localName;
    }
    public name: string;
    public Params: Array<Parameter> = [];
    public RestParam: Parameter = null;
    public Slots = new Map<string, Signature>();

    // Check whether an import signature is compatible with the real module signature
    IsCompatible(sig: Signature): boolean {
        if (!sig) return false;
        let result: any = true;
        
        const mapSigParams = new Map(sig.Params.map(p => [p.name, p.pDefault]));
        // All parameters in the import must be present in the module
        for (const {name, pDefault} of this.Params)
            if (mapSigParams.has(name)) {
                // When optional in the import, then also optional in the module
                result &&= (!pDefault || mapSigParams.get(name));
                mapSigParams.delete(name);
            }
            else result = false
        // Any remaining module parameters must be optional
        for (const pDefault of mapSigParams.values())
            result &&= pDefault;

        // All slots in the import must be present in the module, and these module slots must be compatible with the import slots
        for (let [slotname, slotSig] of this.Slots)
            result &&= sig.Slots.get(slotname)?.IsCompatible(slotSig);
        
        return !!result;
    }
}

// A CONSTRUCTDEF is a concrete instance of a signature
type ConstructDef = {templates: Template[], constructEnv: Environment};
type Template = 
    (this: RCompiler, area: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment)
    => Promise<void>;

export type RVAR_Light<T> = T & {
    _Subscribers?: Set<Subscriber>;
    _UpdatesTo?: Array<RVAR>;
    Subscribe?: (sub:Subscriber) => void;
    readonly U?: T;
};

const gEval = eval;

interface Item {}  // Three unknown but distinct types, used by the <FOR> construct
interface Key {}
interface Hash {}

enum ModType {Attr, Prop, Src, Class, Style, Event, AddToStyle, AddToClassList, RestArgument,
    oncreate, onupdate
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
            if (val !== undefined && val !== elm[name]) elm[name] = val;
            break;
        case ModType.Event:
            let m: RegExpMatchArray;
            if (val)
                if(m = /^on(input|change)$/.exec(name)) {
                    elm.addEventListener(m[1], val as EventListener);
                    (elm as any).handlers.push({evType: m[1], listener: val})
                }
                else {
                    elm[name] = val; 
                    if (/^onclick$/.test(name) && R.Settings.bSetPointer)
                        elm.style.cursor = val && !(elm as HTMLButtonElement).disabled ? 'pointer' : null;
                }
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
            for (const {modType, name, value} of val as RestParameter || [])
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case ModType.oncreate:
            if (bCreate)
                (val as ()=>void).call(elm);
        case ModType.onupdate:
            if (!bCreate)
                (val as ()=>void).call(elm); 
            break;
    }
}
function ApplyModifiers(elm: HTMLElement, modifiers: Modifier[], env: Environment, bCreate?: boolean) {
    // Apply all modifiers: adding attributes, classes, styles, events
    bReadOnly= true;
    for (const {modType, name, depValue} of modifiers)
        try {
            const value = depValue.bThis ? depValue.call(elm, env) : depValue(env);    // Evaluate the dependent value in the current environment
            // See what to do with it
            ApplyModifier(elm, modType, name, value, bCreate)
        }
        catch (err) { throw `[${name}]: ${err}` }
    
    bReadOnly = false;
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
    envActions.push(() => mapSet(constructs, name, prevDef));
}

let updCnt = 0;

class RCompiler {

    static iNum=0;
    public instanceNum = RCompiler.iNum++;

    private ContextMap: Context;
    private context: string;
    private cRvars = new Map<string,boolean>();

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
        this.FilePath   = clone?.FilePath || location.origin + BasePath;
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

            const i = this.ContextMap.get(name);
            if (i == null){
                const savedContext = this.context,
                    i = this.ContextMap.size;
                this.ContextMap.set(name, i);
                this.context += `${name},`
                this.restoreActions.push(
                    () => { this.ContextMap.delete( name );
                        this.context = savedContext;
                    }
                );
                init = ((env: Environment) => {
                    envActions.push( () => {env.length = i;});
                    return (value: unknown) => {env[i] = value };
                }) as LVar;
            }
            else
                init = ((env: Environment) => {
                    const prev = env[i];
                    envActions.push( () => {env[i] = prev } );                    
                    return (value: unknown) => {env[i] = value };
                }) as LVar;
        }
        init.varName = name;
        return init;        
    }

    private AddConstruct(C: Signature) {
        const Cnm = C.name,
            savedConstr = this.CSignatures.get(Cnm);
        this.CSignatures.set(Cnm, C);
        this.restoreActions.push(() => 
            mapSet(this.CSignatures, Cnm, savedConstr)
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
            this.mPreformatted.add(tag.toLowerCase());
        const savedR = R; 
        try {
            if (!this.clone) R = this;
            this.Builder =
                bIncludeSelf
                ? this.CompElement(elm.parentElement, elm as HTMLElement, true)[0]
                : this.CompChildNodes(elm);
            this.bCompiled = true;
        }
        finally {
            R = savedR;
        }
        const t1 = performance.now();
        this.logTime(`Compiled ${this.sourceNodeCount} nodes in ${(t1 - t0).toFixed(1)} ms`);
    }

    logTime(msg: string) {
        if (this.Settings.bTiming)
            console.log(msg);
    }

    private mPreformatted = new Set<string>(['pre']);
        
    Subscriber({parent, bNoChildBuilding, env}: Area, builder: DOMBuilder, range: Range, ...args ): Subscriber {
        range.updated = updCnt;
        const sArea: Area = {
                parent, bNoChildBuilding,
                env: CloneEnv(env), 
                range,
            },
            subscriber: Subscriber = () => {
                const {range} = sArea;
                if (!range.erased && range.updated < updCnt) {
                    range.updated = updCnt;
                    (this as RCompiler).builtNodeCount++;
                    return builder.call(this, {...sArea}, ...args);
                }
            };
        subscriber.sArea = sArea;
        subscriber.ref = range;
        return subscriber;
    }

    public async InitialBuild(area: Area) {
        const savedRCompiler = R, {parentR} = area;
        R = this;
        this.builtNodeCount++;
        await this.Builder(area);
        const subs = this.Subscriber(area, this.Builder, parentR ? parentR.child : area.prevR);
        this.AllAreas.push(subs);
        R = savedRCompiler;        
    }

    public Settings: FullSettings;
    private AllAreas: Subscriber[] = [];
    private Builder: DOMBuilder;
    private wspc = WSpc.block;
    private rspc: number|boolean = 1;

    private bCompiled = false;
    
    public DirtyVars = new Set<RVAR>();
    private DirtySubs = new Map<{}, Subscriber>();
    public AddDirty(sub: Subscriber) {
        this.DirtySubs.set(sub.ref, sub)
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
    }

    public start: number;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating) { 
            this.bUpdate = true;
            return;
        }
        
        for (let i=0;i<2;i++) {
            this.bUpdate = false;
            this.bUpdating = true;
            let savedRCompiler = R;
            updCnt++;
            try {
                for (const rvar of this.DirtyVars)
                    rvar.Save();
                this.DirtyVars.clear();
                
                if (this.DirtySubs.size) {
                    if (!this.clone) R = this;
                    this.start = performance.now();
                    this.builtNodeCount = 0;
                    const subs = this.DirtySubs;
                    this.DirtySubs = new Map();
                    for (const sub of subs.values())
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
                R = savedRCompiler;this.bUpdating = false;
            }
            if (!this.bUpdate) break;
        } 
    }

    /* A "responsive variable" is a variable which listeners can subscribe to. */
    RVAR<T>(
        name?: string, 
        initialValue?: T | Promise<T>, 
        store?: Store,
        subs?: (t:T) => void,
        storeName: string = name
    ) {
        const r = new _RVAR<T>(this.MainC, name, initialValue, store, storeName);
        if (subs)
            r.Subscribe(subs, true, false);
        //this.MainC.CreatedRvars.push(r);
        return r;
    } // as <T>(name?: string, initialValue?: T, store?: Store) => RVAR<T>;
    
    private RVAR_Light<T>(
        t: RVAR_Light<T>, 
        updatesTo?: Array<RVAR>,
    ): RVAR_Light<T> {
        if (!t._Subscribers) {
            t._Subscribers = new Set();
            t._UpdatesTo = updatesTo;
            const R: RCompiler = this.MainC;
            Object.defineProperty(t, 'U',
                {get:
                    () => {
                        if (!bReadOnly) {
                            for (const sub of t._Subscribers)
                                R.AddDirty(sub);
                            if (t._UpdatesTo?.length)
                                for (const rvar of t._UpdatesTo)
                                    rvar.SetDirty();
                            else
                                R.RUpdate();
                        }
                        return t;
                    }
                }
            );
            t.Subscribe = (sub: Subscriber) => { t._Subscribers.add(sub) } ;
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

    //private CreatedRvars: RVAR[] = [];

    private CompIterator(srcParent: ParentNode, iter: Iterable<ChildNode>): DOMBuilder {
        const builders = [] as Array< [DOMBuilder, ChildNode, (boolean|number)?] >
            , {rspc} = this
            , arr = Array.from(iter), L = arr.length;
        let i=0;
        for (const srcNode of arr) {
            i++;
            this.rspc = i==L && rspc;
            let builder: [DOMBuilder, ChildNode, (boolean|number)?];
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    this.sourceNodeCount ++;
                    builder = this.CompElement(srcParent, srcNode as HTMLElement);
                    break;

                case Node.TEXT_NODE:
                    this.sourceNodeCount ++;
                    let str = srcNode.nodeValue;
                    
                    const getText = this.CompString( str ), {fixed} = getText;
                    if (fixed !== '') { // Either nonempty or undefined
                        builder = 
                            [ fixed 
                                ? async (area: Area) => PrepCharData(area, fixed)
                                : async (area: Area) => PrepCharData(area, getText(area.env))
                            , srcNode
                            , fixed==' ' ];
                        
                        if (this.wspc < WSpc.preserve)
                            this.wspc = /\s$/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    break;

                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        const getText = this.CompString(srcNode.nodeValue, 'Comment');
                        builder =
                            [ async (area:Area)=> PrepCharData(area, getText(area.env), true), srcNode, 1]
                    }
                    break;
            }
                       
            if (builder ? builder[0].ws : this.rspc) {
                let i = builders.length - 1, isB: boolean|number;
                while (i>=0 && (isB= builders[i][2])) {
                    if (isB === true)
                        builders.splice(i, 1);
                    i--;
                }
            }
            if (builder) 
                builders.push(builder);
        }
        if (rspc) {
            let i = builders.length - 1, isB: boolean|number;
            while (i>=0 && (isB= builders[i][2])) {
                if (isB === true)
                    builders.splice(i, 1);
                i--;
            }
        }
        if (!builders.length) return null;
        const Iter: DOMBuilder = 
            async function Iter(this: RCompiler, area: Area, start: number = 0)
                // start > 0 is use
            {                
                let i=0;
                if (!area.range) {
                    const toSubscribe: Array<Subscriber> = [];
                    for (const [builder] of builders) {
                        i++;
                        await builder.call(this, area);
                        if (builder.auto)  // Auto subscribe?
                            toSubscribe.push(this.Subscriber(area, Iter, area.prevR, i)); // Not yet the correct range, we need the next range
                    }
                    for (const subs of toSubscribe) {
                        const {sArea} = subs, {range} = sArea, rvar = range.value as RVAR;
                        if (!rvar._Subscribers.size) // No subscribers yet?
                        {   // Then subscribe with the correct range
                            (sArea.range = range.next).updated = 0;
                            subs.ref = {};
                            rvar.Subscribe(rvar.auto = subs);
                        }
                    }
                } else
                    for (const [builder] of builders)
                        if (i++ >= start) {
                            const r = area.range;
                            await builder.call(this, area);
                            if (builder.auto && r.value.auto)  // Auto subscribe?
                                assignEnv((r.value as RVAR).auto.sArea.env, area.env);
                        }
                
                this.builtNodeCount += builders.length - start;
            };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }

    static genAtts = /^((this)?reacts?on|on((create|\*)|(update|\+))+)$/;
    private CompElement(srcParent: ParentNode, srcElm: HTMLElement, bUnhide?: boolean): [DOMBuilder, ChildNode, number?] {
        const atts =  new Atts(srcElm),
            reacts: Array<{attName: string, rvars: Dependent<RVAR[]>}> = [],
            genMods: Array<{attName: string, bCr: boolean, bUpd: boolean, text: string, handler?: Dependent<Handler>}> = [];
        if (bUnhide) atts.set('#hidden', 'false');
        
        let builder: DOMBuilder, elmBuilder: DOMBuilder, isBlank: number;
        try {
            let m: RegExpExecArray;
            for (const attName of atts.keys())
                if (m = RCompiler.genAtts.exec(attName))
                    if (m[3])
                        genMods.push({attName
                            , bCr:  /create|\*/.test(attName)   // Exec on create
                            , bUpd: /update|\+/.test(attName)    // Exec on update
                            , text: atts.get(attName)});
                    else {
                        reacts.push({attName, rvars: this.compAttrExprList<RVAR>(atts, attName, true)});
                    }

            // See if this node is a user-defined construct (component or slot) instance
            const construct = this.CSignatures.get(srcElm.localName);
            if (construct)
                builder = this.CompInstance(srcElm, atts, construct);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define': { // 'LET' staat de parser niet toe.
                        for (let C of srcElm.childNodes)
                            if (!(C.nodeType==Node.TEXT_NODE && /^\s*/.test((C as Text).data)))
                                throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
                        const rvarName  = atts.get('rvar'),
                            varName     = rvarName || atts.get('let') || atts.get('var', true),
                            getStore    = rvarName && this.CompAttrExpr<Store>(atts, 'store'),
                            bReact      = CBool(atts.get('reacting') ?? atts.get('updating')),
                            getValue    = this.CompParameter(atts, 'value', DUndef),
                            newVar      = this.NewVar(varName);

                        if (rvarName) {
                            atts.get('async');
                            // Check for compile-time subscribers
                            const a = this.cRvars.get(rvarName);    // Save previous value
                            this.cRvars.set(rvarName, true);
                            this.restoreActions.push(() => {
                                // Possibly auto-subscribe when there were no compile-time subscribers
                                elmBuilder.auto = this.cRvars.get(rvarName);
                                this.cRvars.set(rvarName, a);
                            });
                        }
                        
                        builder = async function DEF(this: RCompiler, area) {
                                const {range, bInit} = PrepArea(srcElm, area), {env}=area;
                                if (bInit || bReact){
                                    const value = getValue(env);
                                    if (rvarName)
                                        if (bInit)
                                            range.value = new _RVAR(this.MainC, null, value, getStore && getStore(env), rvarName);
                                        else
                                            range.value.SetAsync(value);
                                    else
                                        range.value = value;
                                }
                                newVar(env)(range.value);
                            };
                        isBlank = 1;
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
                            {wspc, rspc}= this;
                        let postWs: WSpc = 0, elseWs=wspc;
                        
                        for (let {node, atts, body} of caseNodes) {
                            const saved = this.SaveContext();
                            this.wspc = wspc; this.rspc = rspc;
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
                                        postWs = Math.max(postWs, this.wspc);
                                        if (not === undefined) elseWs=0;
                                        continue;
                                }
                            } 
                            catch (err) { throw (node.nodeName=='IF' ? '' : OuterOpenTag(node)) + err; }
                            finally { this.RestoreContext(saved) }
                        }
                        this.wspc = Math.max(postWs, elseWs)

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
                                    } catch (err) { 
                                        if (bHiding)
                                            for (const alt of caseList) PrepareElement(alt.node, area);
                                        else
                                            PrepArea(srcElm, area, '', 1, choosenAlt);
                                        throw (alt.node.nodeName=='IF' ? '' : OuterOpenTag(alt.node)) + err }
                                if (bHiding) {
                                    // In this CASE variant, all subtrees are kept in place, some are hidden
                                        
                                    for (const alt of caseList) {
                                        const {range, childArea, bInit} = PrepareElement(alt.node, area);
                                        const bHidden = range.node.hidden = alt != choosenAlt;
                                        if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                            await this.CallWithHandling(alt.builder, alt.node, childArea );
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
                                            await this.CallWithHandling(choosenAlt.builder, choosenAlt.node, subArea );
                                        } finally { RestoreEnv(saved) }
                                    }
                                }
                        }
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
                        C.Settings = {...this.Settings, bRunScripts: true};
                
                        let promiseModule = RModules.get(src);
                        if (!promiseModule) {
                            promiseModule = this.FetchText(src)
                            .then(textContent => {
                                // Parse the contents of the file
                                const parser = new DOMParser(),
                                    parsedDoc = parser.parseFromString(textContent, 'text/html') as Document,
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
                        };
                        isBlank = 1;

                    } break;

                    case 'react': {
                        const getRvars = this.compAttrExprList<RVAR>(atts, 'on', true);
                        const getHashes = this.compAttrExprList<unknown>(atts, 'hash');

                        const bodyBuilder = this.CompChildNodes(srcElm);
                        
                        builder = this.GetREACT(srcElm, 'on', bodyBuilder, getRvars, CBool(atts.get('renew')));

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
                            builder.ws = b.ws;
                        }
                    } break;

                    case 'rhtml': {
                        const getSrctext = this.CompParameter(atts, 'srctext') as Dependent<string>;
                        
                        //const imports = this.CompAttrExpr(atts, 'imports');
                        const modifs = this.CompAttributes(atts);
                        this.wspc=WSpc.block;
                        
                        builder = async function RHTML(this: RCompiler, area) {
                            const srctext = getSrctext(area.env);
                            
                            const {range, bInit} = PrepareElement<{hdrElms: ChildNode[]}>(srcElm, area, 'rhtml-rhtml'), 
                                {node} = range;
                            ApplyModifiers(node, modifs, area.env, bInit);

                            if (area.prevR || srctext != range.result) {
                                range.result = srctext;
                                const shadowRoot = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = document.createElement('rhtml');

                                try {
                                    tempElm.innerHTML = srctext;
                                    if (range.hdrElms) {
                                        for (const elm of range.hdrElms) elm.remove();
                                        range.hdrElms = null;
                                    }
                                    const R = new RCompiler();; // Double ;; is needed for our minifier
                                    (R.head = shadowRoot).innerHTML = '';
                                    R.Compile(tempElm, {bRunScripts: true, bTiming: this.Settings.bTiming}, false);
                                    range.hdrElms = R.AddedHeaderElements;
                                    
                                    const subArea: Area = 
                                        {parent: shadowRoot, range: null, env: NewEnv(), parentR: new Range(null, null, 'Shadow')};
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
                        builder = this.CompScript(srcParent, srcElm as HTMLScriptElement, atts); 
                        isBlank = 1;
                        break;

                    case 'style':
                        this.CompStyle(srcElm);
                        isBlank = 1;
                        break;

                    case 'component': 
                        builder = this.CompComponent(srcParent, srcElm, atts);
                        isBlank = 1;
                        break;

                    case 'document': {
                        const newVar = this.NewVar(atts.get('name', true)),
                            bEncaps = CBool(atts.get('encapsulate')),
                            params=atts.get('params'),
                            RC = this,
                            saved = this.SaveContext(),
                            setVars = (params?.split(',') || []).map(v => this.NewVar(v));
                        try {
                            const
                                docBuilder = RC.CompChildNodes(srcElm),
                                docDef = (env: Environment) => {
                                    env = CloneEnv(env);
                                    return {
                                        async render(parent: HTMLElement, args: unknown[]) {
                                            parent.innerHTML = '';
                                            const saved = SaveEnv();
                                            let i=0;
                                            for (const init of setVars)
                                                init(env)(args[i++]);
                                            try {
                                                await docBuilder.call(RC, {parent, env}); 
                                            }
                                            finally {RestoreEnv(saved);}
                                        },
                                        open(target?: string, features?: string, ...args: unknown[]) {
                                            const W = window.open('', target, features);
                                            W.addEventListener('keydown', 
                                                function(this: Window,event:KeyboardEvent) {if(event.key=='Escape') this.close();}
                                            );
                                            // Copy all style sheet rules
                                            if (!bEncaps)
                                                copyStyleSheets(document, W.document);
                                            this.render(W.document.body, args);
                                            return W;
                                        },
                                        async print(...args: unknown[]) {
                                            const iframe = document.createElement('iframe');
                                            iframe.setAttribute('style','display:none');
                                            document.body.appendChild(iframe);
                                            if (!bEncaps)
                                                copyStyleSheets(document, iframe.contentDocument);
                                            await this.render(iframe.contentDocument.body, args);
                                            iframe.contentWindow.print();
                                            iframe.remove();
                                        }
                                    };
                                };
                            builder = async function DOCUMENT(this: RCompiler, {env}) {
                                newVar(env)(docDef(env));
                            };
                            isBlank = 1;
                        }
                        finally { this.RestoreContext(saved); }
                    }; break;

                    case 'head.': {
                        const childBuilder = this.CompChildNodes(srcElm);
                        
                        builder = function HEAD(this: RCompiler, {parent, env}) {
                            const head = parent.ownerDocument.head;
                            return childBuilder.call(this, {parent: head, env})
                        };
                        isBlank = 1;
                    }; break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        builder = this.CompHTMLElement(srcElm, atts); 
                        break;
                }
                atts.CheckNoAttsLeft();
            }

            for (const g of genMods)
                g.handler = this.CompHandler(g.attName, g.text);
        }
        catch (err) { 
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        if (!builder) return null;
        if (genMods.length) {
            const b = builder;
            builder = async function ON(this: RCompiler, area: Area) {
                const {range} = area;
                await b.call(this, area);
                for (const g of genMods)
                    if (range ? g.bUpd : g.bCr)
                        g.handler(area.env).call((range || area.prevR)?.node);
            }
        }

        for (const {attName, rvars} of reacts)
            builder = this.GetREACT(srcElm, attName, builder, rvars);
        elmBuilder = function Elm(this: RCompiler, area: Area) {
            return this.CallWithHandling(builder, srcElm, area);
        }
        elmBuilder.ws = builder.ws;
        return [elmBuilder, srcElm];
    }

    private GetREACT(
        srcElm: HTMLElement, attName: string, 
        builder: DOMBuilder, 
        getRvars: Dependent<RVAR[]>,
        bRenew=false
    ): DOMBuilder{
        const  updateBuilder: DOMBuilder = 
            ( bRenew
                ? function renew(this: RCompiler, subArea: Area) {
                    const subsubArea = PrepArea(srcElm, subArea, 'renew', 2).subArea;
                    return builder.call(this, subsubArea);
                }
            : /^this/.test(attName)
                ? function reacton(this: RCompiler, subArea: Area) {
                    subArea.bNoChildBuilding = true;
                    return builder.call(this, subArea);
                }
            : builder
            );

        async function REACT(this: RCompiler, area: Area) {
            
            let range: Range, subArea: Area, bInit: boolean;
            if (getRvars) {
                ({range, subArea, bInit} = PrepArea(srcElm, area, attName, true));
                area = subArea;
            }

            if (bRenew)
                area = PrepArea(srcElm, area, 'renew', 2).subArea;

            await builder.call(this, area);

            if (getRvars) {
                const rvars = getRvars(area.env);
                let subscriber: Subscriber, pVars: RVAR[];
                if (bInit)
                    subscriber = this.Subscriber(subArea, updateBuilder, range.child, );
                else {
                    ({subscriber, rvars: pVars} = range.value);
                    assignEnv(subscriber.sArea.env, subArea.env);
                }
                range.value = {rvars, subscriber};
                let i=0;
                for (const rvar of rvars) {
                    if (pVars) {
                        const pvar = pVars[i++];
                        if (rvar==pvar)
                            continue;
                        pvar._Subscribers.delete(subscriber);
                    }
                    try { rvar.Subscribe(subscriber); }
                    catch { throw `[${attName}] This is not an RVAR`; }
                }
            }
        }
        (REACT as DOMBuilder).ws = builder.ws;
        return REACT;
    }

    private async CallWithHandling(this: RCompiler, builder: DOMBuilder, srcNode: ChildNode, area: Area){
        let {range} = area;
        if (range && range.errorNode) {
            area.parent.removeChild(range.errorNode);
            range.errorNode = undefined;
        }
        try {
            //await builder(area);
            return await builder.call(this, area);
        } 
        catch (err) { 
            const message = 
                srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode =
                    area.parent.insertBefore(createErrorNode(message), area.range?.FirstOrNext);
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
                
                const getRange = this.CompAttrExpr<Iterable<Item> | Promise<Iterable<Item>>>(atts, 'of', true),
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

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, area: Area) {
                    const {range, subArea} = PrepArea(srcElm, area, '', true),
                        {parent, env} = subArea,
                        before = subArea.before !== undefined ? subArea.before : range.Next,
                        savedEnv = SaveEnv();
                    try {
                        // Map of previous data, if any
                        const keyMap: Map<Key, Range> = range.value ||= new Map(),
                        // Map of the newly obtained data
                            newMap: Map<Key, {item:Item, hash:Hash, idx: number}> = new Map(),
                            setVar = initVar(env),
                            setIndex = initIndex(env);
                        let iterable = getRange(env);
                        if (iterable) {
                            if (iterable instanceof Promise)
                                iterable = await iterable;
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

                        let prevItem: Item, nextItem: Item
                            , prevRange: Range = null,
                            childArea: Area;
                        subArea.parentR = range;

                        if (nextIterator) nextIterator.next();

                        while(true) {
                            let k: Key;
                            while (nextChild && !newMap.has(k = nextChild.key)) {
                                if (k != null)
                                    keyMap.delete(k);
                                nextChild.erase(parent);
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
                                subArea.before = nextChild?.FirstOrNext || before;
                                // ';' before '(' is needed for our minify routine
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
                                    const nextNode = nextChild?.FirstOrNext || before;
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
                                            const nextNode = nextChild?.FirstOrNext || before;
                                            for (const node of childRange.Nodes())
                                                parent.insertBefore(node, nextNode);
                                        }
                                        break;
                                    }

                                childRange.next = nextChild;
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

                                if (rvar)
                                    if (childRange.rvar)
                                        assignEnv(childRange.subs.sArea.env, env);
                                    else
                                        rvar.Subscribe(
                                            childRange.subs = this.Subscriber(childArea, bodyBuilder, childRange.child)
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
                    const {subArea} = PrepArea(srcElm, area),
                        {env} = subArea,
                        saved= SaveEnv(),
                        slotDef = env.constructs.get(slotName),
                        setIndex = initIndex(area.env);
                    try {
                        let index = 0;
                        for (const slotBuilder of slotDef.templates) {
                            setIndex(index++);
                            env.constructs.set(slotName, {templates: [slotBuilder], constructEnv: slotDef.constructEnv});
                            await bodyBuilder.call(this, subArea);
                        }
                    }
                    finally {
                        mapSet(env.constructs, slotName, slotDef);
                        RestoreEnv(saved);
                    }
                }
            }
        }
        finally { this.RestoreContext(saved) }
    }

    private ParseSignature(elmSignat: Element):  Signature {
        const signature = new Signature(elmSignat);
        for (const attr of elmSignat.attributes) {
            if (signature.RestParam) 
                throw `Rest parameter must be the last`;
            const m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                const param = { 
                    mode: m[1]
                    , name: m[2]
                    , pDefault:
                        m[1] == '...' ? () => []
                        : attr.value != '' 
                        ? (m[1] == '#' ? this.CompJScript(attr.value, attr.name) :  this.CompString(attr.value, attr.name))
                        : m[3] ? /^on/.test(m[2]) ? _=>_=>null : DUndef   // Unspecified default
                        : null 
                    }
                signature.Params.push(param);
                if (m[1] == '...')
                    signature.RestParam = param;
            }
        }
        for (const elmSlot of elmSignat.children)
            signature.Slots.set(elmSlot.localName, this.ParseSignature(elmSlot));
        return signature;
    }

    private CompComponent(srcParent: ParentNode, srcElm: HTMLElement, atts: Atts): DOMBuilder {
        //srcParent.removeChild(srcElm);

        const builders: [DOMBuilder, ChildNode][] = [],
            bEncaps = CBool(atts.get('encapsulate')),
            styles: Node[] = [],
            saveWS = this.wspc;
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
                    if (signature) throw `Illegal child element <${srcChild.nodeName}>`;
                    signature = this.ParseSignature(srcChild);
                    break;
            }
            if (builder) builders.push([builder, srcChild]);
        }
        if (!signature) throw `Missing signature`;
        if (!elmTemplate) throw 'Missing <TEMPLATE>';

        this.AddConstruct(signature);
       
        
        const 
        // Deze builder bouwt de component-instances op
            templates = [
                this.CompTemplate(signature, elmTemplate.content, elmTemplate, 
                    false, bEncaps, styles)
            ];

        this.wspc = saveWS;

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return async function COMPONENT(this: RCompiler, area: Area) {
                for (const [bldr, srcNode] of builders)
                    await this.CallWithHandling(bldr, srcNode, area);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs

                const construct: ConstructDef = {templates, constructEnv: undefined as Environment};
                DefConstruct(area.env, signature.name, construct);
                construct.constructEnv = CloneEnv(area.env);     // Contains circular reference to construct
            };
    }

    private CompTemplate(signat: Signature, contentNode: ParentNode, srcElm: HTMLElement, 
        bNewNames: boolean, bEncaps?: boolean, styles?: Node[], atts?: Atts
    ): Template
    {
        const 
            saved = this.SaveContext(),
            myAtts = atts || new Atts(srcElm),
            lvars: Array<[string, LVar]> = [];
        try {
            for (const {mode,name} of signat.Params)
                lvars.push([name, this.NewVar(myAtts.get(mode + name, bNewNames) || name)]);

            for (const S of signat.Slots.values())
                this.AddConstruct(S);
            if (!atts)
                myAtts.CheckNoAttsLeft();
            this.wspc = this.rspc = WSpc.block;
            const
                builder = this.CompChildNodes(contentNode),
                {name} = signat,
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
                    for (const [name,lvar] of lvars){
                        let arg = args[name], dflt: Dependent<unknown>;
                        if (arg===undefined && (dflt = signat.Params[i]?.pDefault))
                            arg = dflt(env);
                        lvar(env)(arg);
                        i++;
                    }

                    if (bEncaps) {
                        const {range: elmRange, childArea, bInit} = PrepareElement(srcElm, area, customName), 
                            elm = elmRange.node,
                            shadow = elm.shadowRoot || elm.attachShadow({mode: 'open'});
                        if (bInit)
                            for (const style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        
                        if (signat.RestParam)
                            ApplyModifier(elm, ModType.RestArgument, null, args[signat.RestParam.name], bInit);
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
        srcElm: HTMLElement, atts: Atts,
        signature: Signature
    ) {
        //srcParent.removeChild(srcElm);
        const {name, RestParam} = signature,
            contentSlot = signature.Slots.get('content'),
            getArgs = new Map<string,Dependent<unknown>>(),
            slotBuilders = new Map<string, Template[]>();

        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);

        for (const {mode, name, pDefault} of signature.Params)
            if (mode=='@') {
                const attValue = atts.get(mode+name, !pDefault);
                if (attValue) {
                    const depValue = this.CompJScript<unknown>(attValue, mode+name),
                        setter = this.CompJScript<Handler>(
                            `ORx=>{${attValue}=ORx}`,
                            name
                        );
                    getArgs.set(name,
                        env => this.RVAR('', depValue(env), null, setter(env))
                    );
                }
                else
                    getArgs.set(name, env => this.RVAR('', pDefault(env)));
            }
            else if (mode != '...')
                getArgs.set(name, this.CompParameter(atts, name, pDefault) );

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
            
        if (contentSlot)
            slotBuilders.get('content').push(
                this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts)
            );

        if (RestParam) {
            const modifs = this.CompAttributes(atts);
            getArgs.set(RestParam.name, 
                env => modifs.map(
                    ({modType, name, depValue}) => ({modType, name, value: depValue(env)})
                )
            );
        }
        
        atts.CheckNoAttsLeft();
        this.wspc = WSpc.inline;

        return async function INSTANCE(this: RCompiler, area: Area) {
            const {env} = area,
                cdef = env.constructs.get(name),
                {subArea} = PrepArea(srcElm, area);
            if (!cdef) return;
            bReadOnly = true;
            const args = {};
            for (const [nm, getArg] of getArgs)
                args[nm] = getArg(env);
            bReadOnly = false;
            subArea.env = cdef.constructEnv;
            for (const parBuilder of cdef.templates) 
                await parBuilder.call(this, subArea, args, slotBuilders, env);
        }
    }

    static regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select)$/;
    static regInline = /^(button|input|img)$/;
    private CompHTMLElement(srcElm: HTMLElement, atts: Atts) {
        // Remove trailing dots
        const name = srcElm.localName.replace(/\.+$/, '')
            , preWs = this.wspc;
        let postWs: WSpc;

        if (this.mPreformatted.has(name)) {
            this.wspc = WSpc.preserve; postWs = WSpc.block;
        }
        else if (RCompiler.regBlock.test(name)) {
            this.wspc = this.rspc = postWs = WSpc.block
        }
        else if (RCompiler.regInline.test(name)) {
            postWs = WSpc.inline;
        }
        
        if (preWs == WSpc.preserve)
            postWs = WSpc.preserve;

        // We turn each given attribute into a modifier on created elements
        const modifs = this.CompAttributes(atts);

        // Compile the given childnodes into a routine that builds the actual childnodes
        const childnodesBuilder = this.CompChildNodes(srcElm);

        if (postWs)
            this.wspc = postWs;

        // Now the runtime action
        const builder: DOMBuilder = async function ELEMENT(this: RCompiler, area: Area) {
            const {range: {node}, childArea, bInit} = PrepareElement(srcElm, area, name);
            
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
        };

        builder.ws = (postWs == WSpc.block) || preWs < WSpc.preserve && childnodesBuilder.ws;
        // true when whitespace befóre this element may be removed

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
                        depValue: this.CompJScript<boolean>(attValue, attName)
                    });
                else if (m = /^#style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Style, name: CapitalProp(m[1]),
                        depValue: this.CompJScript<unknown>(attValue, attName)
                    });
                else if (m = /^style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Style, name: CapitalProp(m[1]),
                        depValue: this.CompString(attValue, attName)
                    });
                else if (attName == '+style')
                    modifs.push({
                        modType: ModType.AddToStyle, name: null,
                        depValue: this.CompJScript<object>(attValue, attName)
                    });
                else if (attName == "+class")
                    modifs.push({
                        modType: ModType.AddToClassList, name: null,
                        depValue: this.CompJScript<object>(attValue, attName)
                    });
                else if (m = /^([\*\+#!]+|@@?)(.*)/.exec(attName)) { // #, *, !, !!, combinations of these, @ = #!, @@ = #!!
                    const propName = CapitalProp(m[2]);
                    try {
                        const setter = m[1]=='#' ? null : this.CompJScript<Handler>(
                            `function(){const ORx=this.${propName};if(${attValue}!==ORx)${attValue}=ORx}`, attName);
                        
                        if (/[@#]/.test(m[1]))
                            modifs.push({ modType: ModType.Prop, name: propName, depValue: this.CompJScript<unknown>(attValue, attName) });
                        if (/\*/.test(m[1]))
                            modifs.push({ modType: ModType.oncreate, name: 'oncreate', depValue: setter });
                        if (/\+/.test(m[1]))
                            modifs.push({ modType: ModType.onupdate, name: 'onupdate', depValue: setter });
                        if (/[@!]/.test(m[1]))
                            modifs.push({modType: ModType.Event, 
                                name: /!!|@@/.test(m[1]) ? 'onchange' : 'oninput', 
                                depValue: setter});
                    }
                    catch(err) { throw `Invalid left-hand side '${attValue}'`}          
                }
                /*
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
                } */
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
                        depValue: this.CompString(attValue, attName),
                    });
                else
                    modifs.push({
                        modType: ModType.Attr,
                        name: attName,
                        depValue: this.CompString(attValue, attName)
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
    private CompString(data: string, name?: string): Dependent<string> & {fixed?: string} {
        const 
            regIS = this.regIS ||= 
                new RegExp(
                    /(?<![\\$])/.source
                    + (this.Settings.bDollarRequired ? '\\$' : '\\$?')
                    + /\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/.source
                    , 'gs'
                ),
            generators: Array< string | Dependent<unknown> > = [],
            ws: WSpc = name || this.Settings.bKeepWhiteSpace ? WSpc.preserve : this.wspc;
        let isTrivial = true, bThis = false;
        regIS.lastIndex = 0;

        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data);
            let fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed) {
                fixed = fixed.replace(/\\([${}\\])/g, '$1'); // Replace '\{' etc by '{'
                if (ws < WSpc.preserve) {
                    fixed = fixed.replace(/[ \t\n\r]+/g, ' ');  // Reduce whitespace
                    // We can't use \s for whitespace, because that includes nonbreakable space &nbsp;
                    if (ws <= WSpc.inlineSpc && !generators.length)
                        fixed = fixed.replace(/^ /,'');     // No initial whitespace
                    if (this.rspc && !m[1] && regIS.lastIndex == data.length)
                        fixed = fixed.replace(/ $/,'');     // No trailing whitespace
                }
                if (fixed) generators.push( fixed );  
            }
            if (m[1]) {
                const getS = this.CompJScript<string>(m[1], name, '{}');
                generators.push( getS );
                isTrivial = false;
                bThis ||= getS.bThis;
            }
        }
        
        let dep: Dependent<string> & {fixed?: string;};
        if (isTrivial) {
            const result = (generators as Array<string>).join('');
            dep = () => result;
            dep.fixed = result
        } else
            dep = bThis ?
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

    private CompParameter(atts: Atts, attName: string, pDefault?: Dependent<unknown>): Dependent<unknown> {
        const value = atts.get(attName);
        return (
            value == null ? this.CompAttrExpr(atts, attName, !pDefault) || pDefault
            : /^on/.test(attName) ? this.CompHandler(attName, value)
            : this.CompString(value, attName)
        );
    }
    private CompAttrExpr<T>(atts: Atts, attName: string, bRequired?: boolean) {
        return this.CompJScript<T>(atts.get(attName, bRequired, true),attName);
    }

    private CompHandler(name: string, text: string) {
        return this.CompJScript<Handler>(`function(event){${text}\n}`, name)
    }
    private CompJScript<T>(
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
    private compAttrExprList<T>(atts: Atts, attName: string, bReacts?: boolean): Dependent<T[]> {
        const list = atts.get(attName, false, true);
        if (!list) return null;
        if (bReacts)
            for (const nm of list.split(','))
                this.cRvars.set(nm.trim(), false);
        return list ? this.CompJScript<T[]>(`[${list}\n]`, attName) : null;
    }

    private GetURL(src: string) {
        return new URL(src, this.FilePath).href
    }
    private GetPath(src: string) {
        return this.GetURL(src).replace(/[^/]*$/, '');
    }

    async FetchText(src: string): Promise<string> {
        return await (await RFetch(this.GetURL(src))).text();
    }
}

const gFetch=fetch;
export async function RFetch(input: RequestInfo, init?: RequestInit) {
    const r = await gFetch(input, init);
    if (!r.ok)
        throw `${init?.method || 'GET'} ${input} returned ${r.status} ${r.statusText}`;
    return r;
}
globalThis.RFetch = RFetch;


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
        initialValue?: T | Promise<T>, 
        private store?: Store,
        private storeName?: string,
    ) {
        if (globalName) globalThis[globalName] = this;
        this.storeName ||= globalName;
        
        let s: string;
        if ((s = store && store.getItem(`RVAR_${this.storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch{}

        this.SetAsync(initialValue);
    }
    // The value of the variable
    private _Value: T;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    _Subscribers: Set<Subscriber<T>> = new Set();
    auto: Subscriber;

    Subscribe(s: Subscriber<T>, bImmediate?: boolean, bInit: boolean = bImmediate) {
        if (bInit)
            s();
        s.bImm = bImmediate;
        s.ref ||= {};
        this._Subscribers.add(s);
    }
    Unsubscribe(s: Subscriber<T>) {
        this._Subscribers.delete(s);
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
    get Set() {
        return this.SetAsync.bind(this);
    }
    SetAsync(t: T | Promise<T>) {
        if (t instanceof Promise) {
            this.V = undefined;
            t.then(v => {this.V = v})
        } else
            this.V = t;
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
        let b: boolean;
        for (const sub of this._Subscribers)
            if (sub.bImm)
                sub(this._Value);
            else if (!sub.sArea?.range?.erased)
                { this.MainC.AddDirty(sub); b=true}
            else
                this._Subscribers.delete(sub);
        if (b)
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
const words = '(?:access|active|align|animation|aria|background|blend|border|bottom|bounding|break'
+ '|caption|caret|character|child|class|client|clip|(?:col|row)(?=span)|column|content|default|design|document|element'
+ '|feature|fill|first|font|form|get|grid|image|inner|input|^is|last|left|line|margin|^max|^min|next|node|offset|outer'
+ '|outline|overflow|owner|padding|parent|previous|ready?|right|size|rule|scroll|selected|selection'
+ '|table|tab(?=index)|tag|text|top|validation|value|valueas|variant|will)';
// Not: auto
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

function mapSet<K,V>(m: Map<K,V>, k: K, v: V) {
    if (v)
        m.set(k,v);
    else
        m.delete(k);
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

export let R = new RCompiler();

Object.defineProperties(
    globalThis, {
        RVAR:       {get: () => R.RVAR.bind(R)},
        RUpdate:    {get: () => R.RUpdate.bind(R)},
    }
);
globalThis.RCompile = RCompile;
globalThis.RBuild = RBuild;
export const 
    RVAR = globalThis.RVAR as <T>(name?: string, initialValue?: T|Promise<T>, store?: Store, subs?: Subscriber, storeName?: string) => RVAR<T>, 
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
Object.defineProperty(docLocation, 'subpath', {get: () => location.pathname.substr(BasePath.length)});

window.addEventListener('popstate', () => {docLocation.V = location.href;} );

function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substr(1))?.scrollIntoView()), 6);
}
docLocation.Subscribe( () => {
    if (docLocation.V != location.href)
        history.pushState(null, null, docLocation.V);
    docLocation.searchParams = new URLSearchParams(location.search);
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