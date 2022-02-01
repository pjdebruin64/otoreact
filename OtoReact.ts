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
},
parser = new DOMParser()

// A DOMBUILDER is the semantics of a piece of RHTML.
// It can both build (construct) a new piece of DOM, and update an existing piece of DOM.
type DOMBuilder = ((reg: Area) => Promise<void>) & {ws?: boolean; auto?: boolean};
enum WSpc {block = 1, inlineSpc, inline, preserve}

// An AREA is the (runtime) place to build or update, with all required information
type Area = {
    range?: Range,              // Existing piece of DOM
    parent: Node;               // DOM parent node
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
/*
function NextNode(a: Area): ChildNode {
    do {        
        let r = a.range, n: ChildNode;
        while (r) {
            if (n = r.First)
                return n;
            r = r.next;
        }
    }
    while (a = a.parentArea);
}
*/

// A CONTEXT is the set of local variable names, each with a number indicating its position in an environment
type Context = Map<string, number>;

// An ENVIRONMENT for a given context is the array of concrete values for all names in that context,
// together with concrete definitions for all visible constructs
type Environment = 
    Array<unknown> 
    & { constructs: Map<string, ConstructDef>,
    };
type GlobHandlers = 
    { onerror: Handler & {bBldr?: boolean};
        onsucces: Handler; }

// A  DEPENDENT value of type T in a given context is a routine computing a T using an environment for that context.
// It may carry an indicator that the routine might need a value for 'this'.
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dependent<T> = (() => T) & {bThis?: boolean};
const DUndef: Dependent<any> = () => undefined;

function PrepArea(srcElm: HTMLElement, area: Area, text: string = '',
    nWipe?: 1|2,  // 1=wipe when result has changed; 2=wipe always
    result?: any,
) : {range: Range, subArea:Area, bInit: boolean}
{
    let {parent, range} = area,
        subArea: Area = {parent, range: null }
        , bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        subArea.before = area.before;
        if (srcElm) text = `${srcElm.localName}${text?' ':''}${text}`;
        
        UpdatePrevRange(area, range = subArea.parentR = new Range(null, area, text));
        range.result = result;
    }
    else {
        subArea.range = range.child;
        area.range = range.next;

        if (nWipe && (nWipe==2 || result != range.result)) {
            range.result = result;
            range.erase(parent);                 
            range.child = null;
            subArea.range = null;
            subArea.before = range.Next;
            subArea.parentR = range;
            bInit = true;
        }
    }
    
    return {range, subArea, bInit};
}
function UpdatePrevRange(area: Area, range: Range) {
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
        UpdatePrevRange(area, range);
    }
    else {
        area.range = range.next
    }
    return { 
        range, 
        childArea: {
            parent: range.node, 
            range: range.child, 
            before: null,
            parentR: range
        },
        bInit
    };
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
        UpdatePrevRange(area, range);
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
        ToBuild.push({parent: elm.parentElement, source: elm, range: null});

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
    builtNodeCount = 0;
    try {
        for (const area of ToBuild)
            await R.InitialBuild(area);
        R.logTime(`${R.num}: Built ${builtNodeCount} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
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
    const clone = Object.assign(new Array(), env);
    clone.constructs = new Map(env.constructs.entries());
    return clone;
}
function assignEnv(target: Environment, source: Environment) {
    const C = target.constructs;
    Object.assign(target, source);
    //for (const [k,v] of source.constructs.entries()) C.set(k, v);
    target.constructs = C;
}

type Subscriber<T = unknown> = ((t?: T) => (void|Promise<void>)) &
    {   ref?: {};
        sArea?: Area;
        bImm?: boolean;
        env?: Environment;
    };

type ParentNode = HTMLElement|DocumentFragment;


type Handler = (ev:Event) => any;
type LVar = (() => (value: unknown) => void) & {varName: string};

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

enum MType {Attr, Prop, Src, Class, Style, Event, AddToStyle, AddToClassList, RestArgument,
    oncreate, onupdate
}
type Modifier = {
    mType: MType,
    name: string,
    depV: Dependent<unknown>,
}
type RestParameter = Array<{modType: MType, name: string, value: unknown}>;
let bReadOnly: boolean = false;

function ApplyModifier(elm: HTMLElement, modType: MType, nm: string, val: unknown, bCreate: boolean) {    
    switch (modType) {
        case MType.Attr:
            elm.setAttribute(nm, val as string); 
            break;
        case MType.Src:
            elm.setAttribute('src',  new URL(val as string, nm).href);
            break;
        case MType.Prop:
            if (val===undefined && typeof elm[nm]=='string') val = '';
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case MType.Event:
            let m: RegExpMatchArray;
            if (val)
                if(m = /^on(input|change)$/.exec(nm)) {
                    elm.addEventListener(m[1], val as EventListener);
                    (elm as any).handlers.push({evType: m[1], listener: val})
                }
                else {
                    elm[nm] = val; 
                    if (/^onclick$/.test(nm) && R.Settings.bSetPointer)
                        elm.style.cursor = val && !(elm as HTMLButtonElement).disabled ? 'pointer' : null;
                }
            break;
        case MType.Class:
            if (val)
                elm.classList.add(nm);
            break;
        case MType.Style:
            elm.style[nm] = val || (val === 0 ? '0' : null);
            break;
        case MType.AddToStyle:
            if (val) 
                for (const [name,v] of Object.entries(val as Object))
                    elm.style[name] = v || (v === 0 ? '0' : null);
            break
        case MType.AddToClassList:
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
        case MType.RestArgument:
            for (const {modType, name, value} of val as RestParameter || [])
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case MType.oncreate:
            if (bCreate)
                (val as ()=>void).call(elm);
        case MType.onupdate:
            if (!bCreate)
                (val as ()=>void).call(elm); 
            break;
    }
}
function ApplyModifiers(elm: HTMLElement, modifiers: Modifier[], bCreate?: boolean) {
    // Apply all modifiers: adding attributes, classes, styles, events
    bReadOnly= true;
    for (const {mType: modType, name, depV: depValue} of modifiers)
        try {
            const value = depValue.bThis ? depValue.call(elm) : depValue();    // Evaluate the dependent value in the current environment
            // See what to do with it
            ApplyModifier(elm, modType, name, value, bCreate)
        }
        catch (err) { throw `[${name}]: ${err}` }
    
    bReadOnly = false;
}

const RModules = new Map<string, Promise<DOMBuilder>>();

   
/* Runtime data */
let env: Environment,
    onerror: Handler & {bBldr?: boolean},
    onsuccess: Handler,
    builtNodeCount = 0;

const envActions: Array<() => void> = []
type EnvState = number;
function SaveEnv(): EnvState {
    return envActions.length;
}
function RestoreEnv(savedEnv: EnvState) {
    for (let j=envActions.length; j>savedEnv; j--)
        envActions.pop()();
}
function DefConstruct(name: string, construct: ConstructDef) {
    const {constructs} = env, prevDef = constructs.get(name);
    constructs.set(name, construct);
    envActions.push(() => mapSet(constructs, name, prevDef));
}

let updCnt = 0;

class RCompiler {

    static iNum=0;
    public num = RCompiler.iNum++;

    private ContextMap: Context;
    private context: string;
    private CSignatures: Map<string, Signature>;

    private cRvars = new Map<string,boolean>();

    private head: Node;
    private StyleBefore: ChildNode;
    private AddedHeaderElements: Array<HTMLElement>;
    public FilePath: string;
    public RootElm: ParentNode;
 
    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(
        private RC?: RCompiler,
    ) { 
        this.context    = RC?.context || "";
        this.ContextMap = RC ? new Map(RC.ContextMap) : new Map();
        this.CSignatures = RC ? new Map(RC.CSignatures) : new Map();
        this.Settings   = RC ? {...RC.Settings} : {...defaultSettings};
        this.AddedHeaderElements = RC?.AddedHeaderElements || [];
        this.head  = RC?.head || document.head;
        this.StyleBefore = RC?.StyleBefore
        this.FilePath   = RC?.FilePath || location.origin + BasePath;
        this.RC ||= this;
    }
    //private get MainC():RCompiler { return this.clone || this; }

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
           init = (() => (_) => {}) as LVar;
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
                init = (() => {
                    envActions.push( () => {env.length = i;});
                    return (value: unknown) => {env[i] = value };
                }) as LVar;
            }
            else
                init = (() => {
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
            R = this;
            this.Builder =
                bIncludeSelf
                ? this.CompElm(elm.parentElement, elm as HTMLElement, true)[0]
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
        
    Subscriber({parent, bNoChildBuilding}: Area, builder: DOMBuilder, range: Range, ...args ): Subscriber {
        if (range)
            range.updated = updCnt;
        const sArea: Area = {
                parent, bNoChildBuilding,
                range,
            },
            subEnv = {env: CloneEnv(env), onerror, onsuccess},
            subscriber: Subscriber = async () => {
                const {range} = sArea, save = {env, onerror, onsuccess};
                if (!range.erased && (range.updated ?? 0) < updCnt) {
                    range.updated = updCnt;;
                    ({env, onerror, onsuccess} = subEnv);
                    builtNodeCount++;
                    try {
                        await builder.call(this, {...sArea}, ...args);
                    }
                    finally {({env, onerror, onsuccess} = save)}
                }
            };
        subscriber.sArea = sArea;
        subscriber.ref = range;
        subscriber.env = subEnv.env;

        return subscriber;
    }

    public async InitialBuild(area: Area) {
        const saveR = R, {parentR} = area;
        R = this;
        env = NewEnv();
        builtNodeCount++;
        await this.Builder(area);
        const subs = this.Subscriber(area, this.Builder, parentR?.child ?? area.prevR);
        this.AllAreas.push(subs);
        R = saveR;        
    }

    public Settings: FullSettings;
    private AllAreas: Subscriber[] = [];
    private Builder: DOMBuilder;
    private bCompiled = false;

    private wspc = WSpc.block;
    private rspc: number|boolean = 1;
    
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
        this.bUpdate = true;

        if (!this.bUpdating && !this.handleUpdate)
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
        updCnt++;
        
        do {
            this.bUpdate = false;
            this.bUpdating = true;
            let saveR = R;
            try {
                for (const rvar of this.DirtyVars)
                    rvar.Save();
                this.DirtyVars.clear();
                
                if (this.DirtySubs.size) {
                    R = this;
                    this.start = performance.now();
                    builtNodeCount = 0;
                    const subs = this.DirtySubs;
                    this.DirtySubs = new Map();
                    for (const sub of subs.values())
                        try { await sub(); }
                        catch (err) {
                            const msg = `ERROR: ${err}`;
                            console.log(msg);
                            window.alert(msg);
                        }
                    
                    this.logTime(`${R.num}: Updated ${builtNodeCount} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
                }
            }
            finally { 
                R = saveR;this.bUpdating = false;
            }
        }
        while (this.bUpdate)
    }

    /* A "responsive variable" is a variable which listeners can subscribe to. */
    RVAR<T>(
        name?: string, 
        value?: T | Promise<T>, 
        store?: Store,
        subs?: (t:T) => void,
        storeName?: string
    ) {
        const r = new _RVAR<T>(this.RC, name, value, store, storeName);
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
            const {RC} = this as RCompiler;
            Object.defineProperty(t, 'U',
                {get:
                    () => {
                        if (!bReadOnly) {
                            for (const sub of t._Subscribers)
                                RC.AddDirty(sub);
                            if (t._UpdatesTo?.length)
                                for (const rvar of t._UpdatesTo)
                                    rvar.SetDirty();
                            else
                                RC.RUpdate();
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
                    builder = this.CompElm(srcParent, srcNode as HTMLElement);
                    break;

                case Node.TEXT_NODE:
                    this.sourceNodeCount ++;
                    let str = srcNode.nodeValue;
                    
                    const getText = this.CompString( str ), {fixed} = getText;
                    if (fixed !== '') { // Either nonempty or undefined
                        builder = 
                            [ fixed 
                                ? async (area: Area) => PrepCharData(area, fixed)
                                : async (area: Area) => PrepCharData(area, getText())
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
                            [ async (area:Area)=> PrepCharData(area, getText(), true), srcNode, 1]
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
                        if (!rvar._Subscribers.size && range.next) // No subscribers yet?
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
                                assignEnv((r.value as RVAR).auto.env, env);
                        }
                
                builtNodeCount += builders.length - start;
            };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }

    static genAtts = /^(?:((?:this)?reacts?on)|#?on((?:create|\*)|(?:update|\+))+|#?on(?:(error)-?|success))$/;
    private CompElm(srcParent: ParentNode, srcElm: HTMLElement, bUnhide?: boolean): [DOMBuilder, ChildNode, number?] {
        const atts =  new Atts(srcElm),
            reacts: Array<{attName: string, rvars: Dependent<RVAR[]>}> = [],
            genMods: Array<{attName: string, bCr: boolean, bUpd: boolean, text: string, handler?: Dependent<Handler>}> = [];
        let depOnerror: Dependent<Handler> & {bBldr?: boolean}, depOnsuccess: Dependent<Handler>;
        if (bUnhide) atts.set('#hidden', 'false');
        
        let builder: DOMBuilder, elmBuilder: DOMBuilder, isBlank: number;
        try {
            let m: RegExpExecArray;
            for (const attName of atts.keys())
                if (m = RCompiler.genAtts.exec(attName))
                    if (m[1])
                        reacts.push({attName, rvars: this.compAttrExprList<RVAR>(atts, attName, true)});
                    else if (m[2])
                        genMods.push({attName
                            , bCr:  /create|\*/.test(attName)   // Exec on create
                            , bUpd: /update|\+/.test(attName)    // Exec on update
                            , text: atts.get(attName)});
                    else {
                        const dep = this.CompHandler(attName, atts.get(attName));
                        if (m[3]) {
                            depOnerror = dep;
                            depOnerror.bBldr = !/-$/.test(attName);
                        }
                        else depOnsuccess = dep;
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
                            if (C.nodeType!=Node.TEXT_NODE || !/^\s*$/.test((C as Text).data))
                                throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
                        const rvarName  = atts.get('rvar'),
                            varName     = rvarName || atts.get('let') || atts.get('var', true),
                            getValue    = this.CompParameter(atts, 'value', DUndef),
                            getStore    = rvarName && this.CompAttrExpr<Store>(atts, 'store'),
                            bReact      = CBool(atts.get('reacting') ?? atts.get('updating')),
                            newVar      = this.NewVar(varName);

                        if (rvarName) {
                            // Check for compile-time subscribers
                            const a = this.cRvars.get(rvarName);    // Save previous value
                            this.cRvars.set(rvarName, true);
                            this.restoreActions.push(() => {
                                // Possibly auto-subscribe when there were no compile-time subscribers
                                if (elmBuilder) elmBuilder.auto = this.cRvars.get(rvarName);
                                this.cRvars.set(rvarName, a);
                            });
                        }
                        
                        builder = async function DEF(this: RCompiler, area) {
                                const {range, bInit} = PrepArea(srcElm, area);
                                if (bInit || bReact){
                                    const value = getValue();
                                    if (rvarName)
                                        if (bInit)
                                            range.value = new _RVAR(this.RC, null, value, getStore && getStore(), `RVAR_${rvarName}`);
                                        else
                                            range.value.SetAsync(value);
                                    else
                                        range.value = value;
                                }
                                newVar()(range.value);
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
                                const value = getVal && getVal();
                                let choosenAlt: typeof caseList[0] = null;
                                let matchResult: RegExpExecArray;
                                for (const alt of caseList)
                                    try {
                                        if ( !(
                                            (!alt.cond || alt.cond()) 
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
                                                    lvar()(
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
                            
                        const C = new RCompiler(this);
                        C.FilePath = this.GetPath(src);
                        C.Settings.bRunScripts = true;
                
                        let promiseModule = RModules.get(src);
                        if (!promiseModule) {
                            promiseModule = this.FetchText(src)
                            .then(textContent => {
                                // Parse the contents of the file
                                const
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
                        
                        builder = async function IMPORT(this: RCompiler) {
                            const saveEnv = env, builder = await promiseModule;
                            env = NewEnv();
                            await builder.call(C, {parent: document.createDocumentFragment(), start: null, bInit: true});
                            const {constructs} = env;
                            env = saveEnv;
                            for (const {name} of listImports)
                                DefConstruct(name, constructs.get(name));
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
                                const hashes = getHashes();

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
                            const srctext = getSrctext();
                            
                            const {range, bInit} = PrepareElement<{hdrElms: ChildNode[]}>(srcElm, area, 'rhtml-rhtml'), 
                                {node} = range;
                            ApplyModifiers(node, modifs, bInit);

                            if (area.prevR || srctext != range.result) {
                                range.result = srctext;
                                const shadowRoot = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = document.createElement('rhtml'),
                                    savedEnv = env;

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
                                        {parent: shadowRoot, range: null, parentR: new Range(null, null, 'Shadow')};
                                    /* R.StyleBefore = subArea.marker; */
                                    await R.InitialBuild(subArea);
                                }
                                catch(err) {
                                    shadowRoot.appendChild(createErrorNode(`Compile error: ${err}`))
                                }
                                finally { env = savedEnv; }
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
                                docDef = (docEnv: Environment) => {
                                    docEnv = CloneEnv(docEnv);
                                    return {
                                        async render(parent: HTMLElement, args: unknown[]) {
                                            parent.innerHTML = '';
                                            const savedEnv = env;
                                            let i=0;
                                            env = docEnv
                                            for (const init of setVars)
                                                init()(args[i++]);
                                            try {
                                                await docBuilder.call(RC, {parent}); 
                                            }
                                            finally {env = savedEnv}
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
                            builder = async function DOCUMENT(this: RCompiler) {
                                newVar()(docDef(env));
                            };
                            isBlank = 1;
                        }
                        finally { this.RestoreContext(saved); }
                    }; break;

                    case 'rhead': {
                        const childBuilder = this.CompChildNodes(srcElm), {wspc} = this;
                        this.wspc = this.rspc = WSpc.block;
                        
                        builder = async function HEAD(this: RCompiler, area: Area) {
                            const {subArea} = PrepArea(srcElm, area);                            
                            subArea.parent = area.parent.ownerDocument.head;
                            await childBuilder.call(this, subArea);
                        };
                        this.wspc = wspc;
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
        if (depOnerror || depOnsuccess) {
            const b = builder;
            builder = async function SetOnError(this: RCompiler, area: Area) {
                const save = {onerror,onsuccess};
                try {
                    if (depOnerror) 
                    { onerror = depOnerror(); onerror.bBldr = depOnerror.bBldr; }
                    if (depOnsuccess)
                        onsuccess = depOnsuccess();
                    await b.call(this, area);
                }
                finally { ({onerror,onsuccess} = save); }
            }
        }
        if (genMods.length) {
            const b = builder;
            builder = async function ON(this: RCompiler, area: Area) {
                const {range} = area;
                await b.call(this, area);
                for (const g of genMods)
                    if (range ? g.bUpd : g.bCr)
                        g.handler().call((range || area.prevR)?.node);
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
                ({range, subArea, bInit} = PrepArea(srcElm, area, attName));
                area = subArea;
            }

            if (bRenew)
                area = PrepArea(srcElm, area, 'renew', 2).subArea;

            await builder.call(this, area);

            if (getRvars) {
                const rvars = getRvars();
                let subscriber: Subscriber, pVars: RVAR[];
                if (bInit)
                    subscriber = this.Subscriber(subArea, updateBuilder, range.child, );
                else {
                    ({subscriber, rvars: pVars} = range.value);
                    assignEnv(subscriber.env, env);
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
            if (onerror?.bBldr)
                onerror(err);
            else if (this.Settings.bShowErrors) {
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
            builder = async function SCRIPT(this: RCompiler) {
                if (!(bModule || bNoModule || defines || this.Settings.bRunScripts)) {
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
                        init()(exports[name]);
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
                        init()(exports[i++]);
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
                bReacting = CBool(atts.get('reacting') ?? atts.get('reactive')) || !!getUpdatesTo,
            
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
                    const {range, subArea} = PrepArea(srcElm, area, ''),
                        {parent} = subArea,
                        before = subArea.before !== undefined ? subArea.before : range.Next,
                        savedEnv = SaveEnv();
                    try {
                        // Map of previous data, if any
                        const keyMap: Map<Key, Range> = range.value ||= new Map(),
                        // Map of the newly obtained data
                            newMap: Map<Key, {item:Item, hash:Hash, idx: number}> = new Map(),
                            setVar = initVar(),
                            setIndex = initIndex();
                        let iterable = getRange();
                        if (iterable) {
                            if (iterable instanceof Promise)
                                iterable = await iterable;
                            if (!(iterable[Symbol.iterator] || iterable[Symbol.asyncIterator]))
                                throw `[of]: Value (${iterable}) is not iterable`;
                            let idx=0;
                            for await (const item of iterable) {
                                setVar(item);
                                setIndex(idx);
                                const hash = getHash && getHash();
                                const key = getKey?.() ?? hash;
                                if (key != null && newMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                newMap.set(key ?? {}, {item, hash, idx});
                                idx++;
                            }
                        }

                        let nextChild = range.child;

                        const setPrevious = initPrevious(),
                            setNext = initNext(),
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
                                ;({range: childRange, subArea: childArea} = PrepArea(null, subArea, `${varName}(${idx})`));
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
                                childArea = PrepArea(null, subArea, '').subArea;
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

                                if (bReacting) {
                                    if (item === childRange.rvar)
                                        rvar = item;
                                    else {
                                        rvar = this.RVAR_Light(item as object, getUpdatesTo && [getUpdatesTo()])
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
                                        assignEnv(childRange.subs.env, env);
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
                        saved= SaveEnv(),
                        slotDef = env.constructs.get(slotName),
                        setIndex = initIndex();
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
                        : m[3] ? /^on/.test(m[2]) ? ()=>_=>null : DUndef   // Unspecified default
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
            {wspc} = this;
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

        this.wspc = wspc;

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return async function COMPONENT(this: RCompiler, area: Area) {
                for (const [bldr, srcNode] of builders)
                    await this.CallWithHandling(bldr, srcNode, area);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs

                const construct: ConstructDef = {templates, constructEnv: undefined as Environment};
                DefConstruct(signature.name, construct);
                construct.constructEnv = CloneEnv(env);     // Contains circular reference to construct
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
                const saved = SaveEnv();
                try {
                    for (const [slotName, templates] of mSlotTemplates)
                        DefConstruct(slotName, {templates, constructEnv: slotEnv});
                    
                    let i = 0;
                    for (const [name,lvar] of lvars){
                        let arg = args[name], dflt: Dependent<unknown>;
                        if (arg===undefined && (dflt = signat.Params[i]?.pDefault))
                            arg = dflt();
                        lvar()(arg);
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
                            ApplyModifier(elm, MType.RestArgument, null, args[signat.RestParam.name], bInit);
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
                        () => this.RVAR('', depValue(), null, setter())
                    );
                }
                else
                    getArgs.set(name, () => this.RVAR('', pDefault()));
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
                () => modifs.map(
                    ({mType: modType, name, depV: depValue}) => ({modType, name, value: depValue()})
                )
            );
        }
        
        atts.CheckNoAttsLeft();
        this.wspc = WSpc.inline;

        return async function INSTANCE(this: RCompiler, area: Area) {
            const savedEnv = env,
                cdef = env.constructs.get(name),
                {subArea} = PrepArea(srcElm, area);
            if (!cdef) return;
            bReadOnly = true;
            const args = {};
            for (const [nm, getArg] of getArgs)
                args[nm] = getArg();
            bReadOnly = false;
            env = cdef.constructEnv;
            try {
                for (const template of cdef.templates) 
                    await template.call(this, subArea, args, slotBuilders, savedEnv);
            }
            finally {env = savedEnv;}
        }
    }

    static regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/;
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
            postWs = this.wspc = this.rspc = WSpc.block
        }
        else if (RCompiler.regInline.test(name)) {  // Inline-block
            this.wspc = this.rspc = WSpc.block;
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
            ApplyModifiers(node, modifs, bInit);
        };

        builder.ws = (postWs == WSpc.block) || preWs < WSpc.preserve && childnodesBuilder.ws;
        // true when whitespace befóre this element may be removed

        return builder;
    }

    private CompAttributes(atts: Atts) { 
        const modifs: Array<Modifier> = [];

        for (let [aName, aVal] of atts) {
            aName = aName.replace(/\.+$/,'');
            let m: RegExpExecArray;
            try {
                if (m = /^on(.*?)\.*$/i.exec(aName))               // Events
                    modifs.push({
                        mType: MType.Event, 
                        name: CapitalProp(m[0]), 
                        depV: this.AddErrHandler(this.CompHandler(aName, aVal))
                    });
                else if (m = /^#class[:.](.*)$/.exec(aName))
                    modifs.push({
                        mType: MType.Class, name: m[1],
                        depV: this.CompJScript<boolean>(aVal, aName)
                    });
                else if (m = /^#style\.(.*)$/.exec(aName))
                    modifs.push({
                        mType: MType.Style, name: CapitalProp(m[1]),
                        depV: this.CompJScript<unknown>(aVal, aName)
                    });
                else if (m = /^style\.(.*)$/.exec(aName))
                    modifs.push({
                        mType: MType.Style, name: CapitalProp(m[1]),
                        depV: this.CompString(aVal, aName)
                    });
                else if (aName == '+style')
                    modifs.push({
                        mType: MType.AddToStyle, name: null,
                        depV: this.CompJScript<object>(aVal, aName)
                    });
                else if (aName == "+class")
                    modifs.push({
                        mType: MType.AddToClassList, name: null,
                        depV: this.CompJScript<object>(aVal, aName)
                    });
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(aName)) { // #, *, !, !!, combinations of these, @ = #!, @@ = #!!
                    const name = CapitalProp(m[2]);
                    try {
                        const setter = m[1]=='#' ? null : this.CompJScript<Handler>(
                            `function(){const ORx=this.${name};if(${aVal}!==ORx)${aVal}=ORx}`, aName);
                        
                        if (/[@#]/.test(m[1])) {
                            let depV = this.CompJScript<Handler>(aVal, aName);
                            if (/^on/.test(name))
                                modifs.push({mType: MType.Event, name
                                    , depV: this.AddErrHandler(depV as Dependent<Handler>) });
                            else
                                modifs.push({ mType: MType.Prop, name, depV });
                        }
                        if (/\*/.test(m[1]))
                            modifs.push({ mType: MType.oncreate, name: 'oncreate', depV: setter });
                        if (/\+/.test(m[1]))
                            modifs.push({ mType: MType.onupdate, name: 'onupdate', depV: setter });
                        if (/[@!]/.test(m[1]))
                            modifs.push({mType: MType.Event, 
                                name: /!!|@@/.test(m[1]) ? 'onchange' : 'oninput', 
                                depV: setter});
                    }
                    catch(err) { throw `Invalid left-hand side '${aVal}'`}          
                }
                else if (m = /^\.\.\.(.*)/.exec(aName)) {
                    if (aVal) throw `A rest parameter cannot have a value`;
                    modifs.push({
                        mType: MType.RestArgument, name: null,
                        depV: this.CompName(m[1])
                    });
                }
                else if (aName == 'src')
                    modifs.push({
                        mType: MType.Src,
                        name: this.FilePath,
                        depV: this.CompString(aVal, aName),
                    });
                else
                    modifs.push({
                        mType: MType.Attr,
                        name: aName,
                        depV: this.CompString(aVal, aName)
                    });
            }
            catch (err) {
                throw(`[${aName}]: ${err}`)
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
                function(this: HTMLElement) {
                    try {
                        let result = "";
                        for (const gen of generators)
                            result += typeof gen == 'string' ? gen : gen.call(this) ?? '';
                        return result;
                    }
                    catch (err) { throw name ? `[${name}]: ${err}` : err }
                }
            :   () => {
                try {
                    let result = "";
                    for (const gen of generators)
                        result += typeof gen == 'string' ? gen : gen() ?? '';
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
        return /^#/.test(name) ? this.CompJScript<Handler>(text, name)
            : this.CompJScript<Handler>(`function(event){${text}\n}`, name)
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
                ? function (this: HTMLElement) {
                        try { return routine.call(this, env); } 
                        catch (err) { throw errorInfo + err; }
                    }
                : () => {
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
        return () => env[i];
    }
    private compAttrExprList<T>(atts: Atts, attName: string, bReacts?: boolean): Dependent<T[]> {
        const list = atts.get(attName, false, true);
        if (!list) return null;
        if (bReacts)
            for (const nm of list.split(','))
                this.cRvars.set(nm.trim(), false);
        return list ? this.CompJScript<T[]>(`[${list}\n]`, attName) : null;
    }

    private AddErrHandler(getHndlr: Dependent<Handler>): Dependent<Handler> {
        return () => {
            const hndlr = getHndlr(), onerr = onerror, onsucc = onsuccess;
            if (hndlr && (onerr||onsucc))
                return function hError(this: HTMLElement, ev: Event) {
                    try {
                        const result = hndlr.call(this,ev);
                        if (result instanceof Promise)
                            return result.then(onsucc, onerr);
                        if (onsucc) onsucc(null);
                        return result;
                    }
                    catch (err) {
                        if (!onerr) throw err;
                        onerr(err);
                    }
                };
            return hndlr;
        };
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
        private RC: RCompiler,
        name?: string, 
        initialValue?: T | Promise<T>, 
        private store?: Store,
        private storeName: string = `RVAR_${name}`,
    ) {
        if (name) globalThis[name] = this;
        
        const s = store && store.getItem(storeName);
        if (s != null)
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
    SetAsync(t: T | Promise<T>) {
        if (t instanceof Promise) {
            this.V = undefined;
            t.then(v => {this.V = v}, onerror);
        } else
            this.V = t;
    }
    get Set() {
        return this.SetAsync.bind(this);
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
            this.RC.DirtyVars.add(this);
        let b: boolean;
        for (const sub of this._Subscribers)
            if (sub.bImm)
                sub(this._Value);
            else if (!sub.sArea?.range?.erased)
                { this.RC.AddDirty(sub); b=true}
            else
                this._Subscribers.delete(sub);
        if (b)
            this.RC.RUpdate();
    }

    public Save() {
        this.store.setItem(this.storeName, JSON.stringify(this._Value));
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
        ? s.substring(0, maxLength - 3) + "..."
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
Object.defineProperty(docLocation, 'subpath', {get: () => location.pathname.substring(BasePath.length)});

window.addEventListener('popstate', () => {docLocation.V = location.href;} );

function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substring(1))?.scrollIntoView()), 6);
}
docLocation.Subscribe( () => {
    if (docLocation.V != location.href) {
        history.pushState(null, null, docLocation.V);
    }
    docLocation.searchParams = new URLSearchParams(location.search);
    ScrollToHash();;
}, true);

export const reroute = globalThis.reroute = 
(arg: MouseEvent | string) => {
    if (typeof arg != 'string') {
        if (arg.ctrlKey)
            return;
        arg.preventDefault();
        arg = (arg.target as HTMLAnchorElement).href;
    }
    docLocation.V = new URL(arg, location.href).href;
}