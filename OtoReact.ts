// Global settings 
const
    U = undefined, N = null, T = true, F = false, E = [], W = window, D = document,
    G = // Polyfill for globalThis
        W.globalThis || ((W as any).globalThis = W.self),
    defaults = {
        bTiming:        F,
        bAbortOnError:  F,      // Abort processing on runtime errors,
                                // When false, only the element producing the error will be skipped
        bShowErrors:    T,      // Show runtime errors as text in the DOM output
        bRunScripts:    F,
        basePattern:    '/',
        preformatted:   E as string[],
        bNoGlobals:     F,
        bDollarRequired: F,
        bSetPointer:    T,
        bKeepWhiteSpace: F,
        bKeepComments:  F,
        storePrefix:    "RVAR_"
    },
    parser = new DOMParser(),
    gEval = eval,
    ass = Object.assign;

// Type used for truthy / falsy values
type booly = boolean|string|number|object;

// Current whitespace mode of the compiler:
const enum WSpc {
    block = 1,      // We are in block mode; whitespace is irrelevant
    inlineSpc,      // We are in inline mode with trailing whitespace, so more whitespace can be skipped
    inline,         // We are in inline mode, whitespace is relevant
    preserve        // Preserve all whitespace
}

// For any HTMLElement we create, we remember which event handlers have been added,
// So we can remove them when needed
type RHTMLElement = HTMLElement & {
    hndlrs?: Array<{evType: string, listener: Handler}>
};

/* A DOMBUILDER is the semantics of a piece of RHTML.
    It can both build (construct, create) a new range of DOM, and update an earlier created range of DOM.
    The created DOM is yielded in 'area.rng'.
*/
type DOMBuilder = ((area: Area, ...args: any[]) => Promise<void>) 
    & {
        ws?: boolean;   // True when the builder won't create any DOM other than blank text
        auto?: boolean; /* When true, the DOMBuilder will create an RVAR that MIGHT need auto-subscribing.
                        The .value of the Range created by the DOMBuilder must be the RVAR. */
    };


/* An AREA is a (runtime) place to build or update a piece of DOM, with all required information a builder needs.
    Area's are transitory objects; discarded after the builders are finished
*/
type Area = {
    rng?: Range,          // Existing piece of DOM
    // When undefined or null, the DOM has to be CREATED
    // When defined, the DOM has to be UPDATED

    parN: Node;            // DOM parent node
    bfor?: ChildNode;     // DOM node before which new nodes are to be inserted

    /* When !rng, i.e. when the DOM has to be created: */
    srcN?: ChildNode;     // Optional source node to be replaced by the new DOM 
    parR?: Range;         // The new range shall either be the first child of some range,
    prevR?: Range;        // Or the next sibling of some other range

    /* When rng, i.e. when the DOM has to be updated: */
    bRootOnly?: boolean,  // true == just update the root node, not its children
                          // Set by 'thisreactson'.
}

/* A RANGE object describe a (possibly empty) range of constructed DOM nodes, in relation to the source RHTML.
    It can either be a single DOM node, with child nodes described by a linked list of child-ranges,
    OR just a linked list of subranges.
    It is created by a builder, and contains all metadata needed for updating or destroying the DOM.
*/
class Range<NodeType extends ChildNode = ChildNode> {
    node: NodeType;     // Optional DOM node, in case this range corresponds to a single node
    
    child: Range;       // Linked list of child ranges (null=empty)
    next: Range;        // Next range in linked list

    parR?: Range;    // Parent range, only when both belong to the SAME DOM node
    parN?: Node;     // Parent node, only when this range has a DIFFERENT parent node than its parent range

    constructor(
        area: Area,             // Area where the new range is to be inserted
        node: NodeType,         // Optional DOM node
        public text?: string,   // Description, used only for comments
    ) {
        this.node = node;
        if (area) {
            let r: Range =  area.parR;
            if (r && !r.node)
                this.parR = r;
            
            // Insert this range in a linked list, as indicated by 'area'
            if (r = area.prevR) 
                r.next = this;
            else if (r = area.parR)
                r.child = this;
        
            area.prevR = this;
        }
    }

    toString() { return this.text || this.node?.nodeName; }

    // Get first childnode IN the range
    public get First(): ChildNode {
        let f: ChildNode
        if (f = this.node) return f;
        let c = this.child;
        while (c) {
            if (f = c.First) return f;
            c = c.next;
        }
    }
    
    // Get first node with the same parent node AFTER the range
    public get Next(): ChildNode {
        let r: Range = this, n: ChildNode, p: Range;
        do {
            p = r.parR;
            while (r = r.next)
                if (n = r.First) return n;
        } while (r = p)
    }

    public get FirstOrNext() {
        return this.First || this.Next;
    }

    // Enumerate all DOM nodes within this range, not including their children
    Nodes(): Generator<ChildNode> { 
        // 'Nodes' is a recursive enumerator, that we apply to 'this'
        return (function* Nodes(r: Range) {
            let c: Range;
            if (r.node)
                yield r.node;
            else if (c = r.child)
                do {
                    yield* Nodes(c);
                } while (c = c.next)
        })(this)
    }

    // The following properties may contain different types of meta-information about the created DOM, to be used by the builder.

    res?: any;  // Some result value to be kept by a builder
    val?: any;  // Some other value to be kept by a builder

    errNode?: ChildNode;  // When an error description node has been inserted, it is saved here, so it can be removed on the next update

    bfDest?: Handler;   // Before destroy handler
    onDest?: Handler;   // After destroy handler

    // Only for FOR-iteraties
    hash?: Hash; key?: Key; prev?: Range;
    fragm?: DocumentFragment;

    // For reactive elements
    updated?: number;       // last DoUpdate iteration number, so the range is not updated again in the same iteration
    subs?: Subscriber;      // Subscriber object created for this element instance
    rvars?: RVAR[];         // RVARs on which the element reacts

    // For DOCUMENT nodes
    wins?: Set<Window>;     // Set of child windows

    // Erase the range, i.e., destroy all child ranges and remove all nodes.
    // The range itself remains a child of its parent.
    erase(par: Node) {
        let {node, child: ch} = this;
        if (node && par) {
            // Remove the current node, only when 'par' is specified
            par.removeChild(node);
            par = N; // No need to remove child nodes of this node
        }
        this.child = N;
        while (ch) {
            if (ch.bfDest) // Call a 'beforedestroy' handler
                ch.bfDest.call(ch.node || par);
            // Destroy 'ch'
            ch.erase(ch.parN || par);
            // Remove range ch from any RVAR it is subscribed to
            if (ch.rvars)
                for (let r of ch.rvars)
                    r._Subs.delete(ch.subs);
            if (ch.onDest)  // Call 'ondestroy' handler
                ch.onDest.call(ch.node || par);
            ch = ch.next;
        }
    }
}

// A CONTEXT is the set of currently visible local variable names, each with a number indicating its position in an environment
type Context = Map<string, number>;

// An ENVIRONMENT for a given context is the array of concrete values for all names in that context,
// together with concrete definitions for all constructs
type CKey = number;     //Constructmap key
type Environment = 
    Array<any>                      // Local variable values
    & {
        C: Array<ConstructDef>;    // Current construct definitions
    }

// A  DEPENDENT value of type T in a given context is a routine computing a T, using the current environment (env) for that context.
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dependent<T> = (() => T) 
    & {
        bThis?: boolean;        // true when the function might refer to 'this'
    };
let dU: Dependent<any> = () => U,       // Undefined dep.value
    dumB: DOMBuilder = async () => {};  // A dummy DOMBuilder

/* The following function prepares a sub area of a given 'area', 
    containing (when creating) a new Range,
    AND updates 'area' to point to the next range in a linked list.

    It can assign some custom result value to the range,
    and on updating it can optionally erase the range, either when the result value has changed or always.
*/
function PrepArea(
    srcE: HTMLElement,  // Source element, just for error messages
    area: Area,         // Given area
    text: string = '',  // Optional text for error messages
    nWipe?: 1|2,    // 1=erase 'area.rng' when 'res' has changed; 2=erase always
    res?: any,      // Some result value to be remembered
) : {
    rng: Range,     // The newly created or updated child range
    sub: Area,       // The new sub area
    bCr: boolean    // True when the sub-range has to be created
}
{
    let {parN, rng} = area,  // Initially 'rng' is the parent range
        sub: Area = {parN, rng: N }
        , bCr = !rng;
    if (bCr) {
        sub.srcN = area.srcN;
        sub.bfor = area.bfor;
        if (srcE) text = srcE.localName + (text && ' ') + text;
        
        (rng = sub.parR = new Range(area, N, text)).res = res;
    }
    else {
        sub.rng = rng.child;
        area.rng = rng.next;

        if (nWipe && (nWipe>1 || res != rng.res)) {
            rng.res = res;
            rng.erase(parN); 
            sub.rng = N;
            sub.bfor = rng.Next;
            sub.parR = rng;
            bCr = T;
        }
    }
    
    return {rng, sub, bCr};
}

/*
    Prepare a sub area of a given 'area',
    and on creating insert a new HTMLElement.

    On updating, update 'area' to point to the next range.
*/
function PrepElm<T={}>(
    srcE: HTMLElement, 
    area: Area, 
    nodeName = srcE.nodeName
): {
    rng: Range<RHTMLElement> & T    // Sub-range
    , chArea: Area                  // Sub-area
    , bCr: boolean                  // True when the sub-range is being created
} {
    let rng = area.rng as Range<HTMLElement> & T,
        bCr = !rng;
    if (bCr)
        rng = new Range(area,
            area.srcN == srcE
                ? (srcE.innerHTML = "", srcE)
                : area.parN.insertBefore<HTMLElement>(
                    D.createElement(nodeName), area.bfor
                )
            ) as Range<HTMLElement> & T;
    else
        area.rng = rng.next;

    return { 
        rng, 
        chArea: {
            parN: rng.node, 
            rng: rng.child, 
            bfor: N,
            parR: rng
        },
        bCr
    };
}

/*
    Prepare a sub area of a given 'area',
    and on creating insert either a comment or a text node.

    On updating, update 'area' to point to the next range.
*/
function PrepCharData(area: Area, content: string, bComm?: boolean) {
    let rng = area.rng as Range<CharacterData>;
    if (!rng)
        new Range(area,
            area.parN.insertBefore(
                bComm ? D.createComment(content) : D.createTextNode(content)
                , area.bfor)
        );
    else {
        rng.node.data = content;
        area.rng = rng.next;
    }
}

type FullSettings = typeof defaults;
type Settings = Partial<FullSettings>;
let childWins=new Set<Window>();

export async function RCompile(elm: HTMLElement = D.body, settings?: Settings): Promise<void> { 
    try {
        let {basePattern} = R.Settings = {...defaults, ...settings},
            m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (
            docLocation.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : ''
        )
        await R.Compile(elm);

        // Initial build
        start = performance.now();
        builtNodeCnt = 0;
        let area: Area = {parN: elm.parentElement, srcN: elm, rng: N};
        await R.Build(area);
        W.addEventListener('pagehide', ()=>childWins.forEach(w=>w.close()));
        R.logTime(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (e) {    
        alert(`OtoReact error: `+LAbbr(e));
    }
}

type SavedContext = number;
function NewEnv(): Environment { 
    return addP([] as Environment, 'C', []);
}
function CloneEnv(env: Environment): Environment {
    return addP(ass([], env), 'C', ass([], env.C))
}
function assignEnv(target: Environment, source: Environment) {
    let C = ass(target.C, source.C);;
    ass(target, source);
    target.C = C;
}
function GetC(env: Environment, k: CKey): ConstructDef {
    return env.C[k];
}

type Subscriber<T = unknown> = ((t?: T) => (void|Promise<void>)) &
    {   sArea?: Area;
        bImm?: boolean;
        env?: Environment;
    };

type ParentNode = HTMLElement|DocumentFragment;


type Handler = (ev:Event) => any;
type LVar = ((value?: unknown, bUpd?: boolean) => void) & {nm: string};

// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {mode: string, nm: string, pDflt: Dependent<unknown>};
// A SIGNATURE describes an RHTML user construct: a component or a slot
class Signature {
    constructor(
        public srcElm: Element,
        public bIsSlot: boolean
    ){ 
        this.nm = srcElm.localName;
    }
    public nm: string;
    public prom: Promise<any>;
    public Params: Array<Parameter> = [];
    public RestP: Parameter = N;
    public Slots = new Map<string, Signature>();
    public CSlot: Signature;
    public i?: number;

    // Check whether an import signature is compatible with the real module signature
    IsCompatible(sig: Signature): boolean {
        if (!sig) return ;
        let r = T,
            mapSigParams = new Map(sig.Params.map(p => [p.nm, !!p.pDflt]));
        // All parameters in the import must be present in the module
        for (let {nm, pDflt} of this.Params)
            if (mapSigParams.has(nm)) {
                // When optional in the import, then also optional in the module
                r &&= (!pDflt || mapSigParams.get(nm));
                mapSigParams.delete(nm);
            }
            else r = F
        // Any remaining module parameters must be optional
        for (let pDflt of mapSigParams.values())
            r &&= pDflt;

        // All slots in the import must be present in the module, and these module slots must be compatible with the import slots
        for (let [nm, slotSig] of this.Slots)
            r &&= sig.Slots.get(nm)?.IsCompatible(slotSig);
        
        return r;
    }
}

// A CONSTRUCTDEF is a concrete instance of a signature
type ConstructDef = {
    nm: string,             // Name of the construct
    templates: Template[],  // Template, or in case of a slot construct, possibly multiple templates
    CEnv?: Environment,     // Environment at the point the construct was declared
    Cnm?: string  // In case of a slot construct: the component name to which the slot belongs
};
/*
*/
type Template = 
    (area: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment)
    => Promise<void>;


interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
class _RVAR<T = unknown>{
    constructor(
        public name?: string, 
        initial?: T | Promise<T>, 
        public store?: Store,
        private storeName?: string,
    ) {
        if (name) G[name] = this;
        
        let s = store && store.getItem(this._sNm), t= initial;
        if (s)
            try {
                this._val = JSON.parse(s);
                return;
            }
            catch{}

        t instanceof Promise ?
            t.then(v => (this.V = v), onerr)
            : (this._val = t)
    }
    // The value of the variable
    private _val: T = U;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    _Subs: Set<Subscriber<T>> = new Set();
    auto: Subscriber;
    private get _sNm() {
        return this.storeName || R.Settings.storePrefix + this.name;
    }

    Subscribe(s: Subscriber<T>, bImmediate?: boolean, bCr: boolean = bImmediate) {
        if (bCr)
            s(this._val);
        s.bImm = bImmediate;
        this._Subs.add(s);
    }
    Unsubscribe(s: Subscriber<T>) {
        this._Subs.delete(s);
    }
    // Use var.V to get or set its value
    get V() { return this._val }
    // When setting, it will be marked dirty.
    set V(t: T) {
        if (t !== this._val) {
            this._val = t;
            this.SetDirty();
        }
    }
    _Set(t: T | Promise<T>): T | Promise<T> {
        return t instanceof Promise ?
            ( (this.V = U), t.then(v => (this.V = v), onerr))
            : (this.V = t);
    }
    get Set() {
        return this._Set.bind(this);
    }
    get Clear() {
        return () => 
            DirtyVars.has(this) || (this.V=U);
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { 
        if (!bRO) this.SetDirty();  
        return this._val }
    set U(t: T) { this._val = t; this.SetDirty(); }

    public SetDirty() {
        let b:boolean;
        for (let sub of this._Subs)
            if (sub.bImm)
                sub(this._val);
            else b=T;
        if (b || this.store) {
            DirtyVars.add(this);
            RUpdate();
        }
    }

    public Save() {
        this.store.setItem(this._sNm, JSON.stringify(this._val ?? null));
    }

    toString() {
        return this._val.toString();
    }
}
export type RVAR<T = unknown> = _RVAR<T>;

export type RVAR_Light<T> = T & {
    _Subs: Set<Subscriber>;
    _UpdTo?: Array<RVAR>;
    Subscribe?: (sub:Subscriber) => void;
    store?: any;
    Save?: () => void;
    readonly U?: T;
};

        
function Subscriber({parN, bRootOnly}: Area, builder: DOMBuilder, rng: Range, ...args: any[] ): Subscriber {
    if (rng) rng.updated = updCnt;
    let sArea: Area = {
            parN, bRootOnly,
            rng,
        },
        subEnv = {env: CloneEnv(env), onerr, onsucc},
        subs: Subscriber = async () => {
            let {rng} = sArea, save = {env, onerr, onsucc};
            if (!rng || rng.updated < updCnt)
            {
                ({env, onerr, onsucc} = subEnv);
                if (rng) rng.updated = updCnt;
                builtNodeCnt++;
                try {
                    await builder({...sArea}, ...args);
                }
                finally {({env, onerr, onsucc} = save)}
            }
        };
    subs.sArea = sArea;
    subs.env = subEnv.env;

    return subs;
}


let DirtyVars = new Set<{_Subs: Set<Subscriber>; store?: any; Save?: () => void}>(),

// Bijwerken van alle elementen die afhangen van reactieve variabelen
    bUpdating: boolean,
    hUpdate: number = N,
    start: number;

function RUpdate() {
    if (!bUpdating && !hUpdate)
        hUpdate = setTimeout(() => {
            hUpdate = N;
            DoUpdate();
        }, 5);
}

export async function DoUpdate() {
    if (!R.bCompiled || bUpdating)
        return;

    bUpdating = T;
    try {
        builtNodeCnt = 0;
        start = performance.now();
        while (DirtyVars.size) {
            updCnt++;
            let dv = DirtyVars;
            DirtyVars = new Set();
            for (let rv of dv) {
                if (rv.store)
                    rv.Save();
                for (let subs of rv._Subs)
                    if (!subs.bImm)
                        try { 
                            await subs(rv instanceof _RVAR ? rv.V : rv); }
                        catch (e) {    
                            console.log(e = `ERROR: `+LAbbr(e));
                            alert(e);
                        }
            }
        }
        R.logTime(`${R.num}: Updated ${builtNodeCnt} nodes in ${(performance.now() - start).toFixed(1)} ms`);
    }
    finally { bUpdating = F; }
}

/* A "responsive variable" is a variable that listeners can subscribe to. */
export function RVAR<T>(
    nm?: string, 
    value?: T | Promise<T>, 
    store?: Store,
    subs?: (t:T) => void,
    storeName?: string
): RVAR<T> {
    let r = new _RVAR<T>(nm, value, store, storeName);
    if (subs)
        r.Subscribe(subs, T, F);
    return r;
}

function RVAR_Light<T>(
    t: RVAR_Light<T>, 
    updTo?: Array<RVAR>,
): RVAR_Light<T> {
    if (!t._Subs) {
        t._Subs = new Set();
        t._UpdTo = updTo;
        Object.defineProperty(t, 'U',
            {get:
                () => {
                    if (!bRO) {
                        DirtyVars.add(t);
                        if (t._UpdTo?.length)
                            for (let rvar of t._UpdTo)
                                rvar.SetDirty();
                        else
                            RUpdate();
                    }
                    return t;
                }
            }
        );
        t.Subscribe = (sub: Subscriber) => { t._Subs.add(sub) } ;
    }
    return t;
}

interface Item {}  // Three unknown but distinguished types, used by the <FOR> construct
interface Key {}
interface Hash {}

const enum MType {Attr, Prop, Src, Class, Style, Event, AddToStyle, AddToClassList, RestArgument,
    oncreate, onupdate
}
type Modifier = {
    mt: MType,
    nm: string,
    c?: booly   // Truthy when nm has been checked for proper casing
    depV: Dependent<unknown>,
}
type RestParameter = Array<{M: Modifier, value: unknown}>;
let bRO: boolean = F;

function ApplyMod(elm: RHTMLElement, M: Modifier, val: unknown, bCr: boolean) {
    let {mt, nm} = M;
    if (!M.c) {
        if (mt == MType.Prop && nm=='valueasnumber' && (elm as HTMLInputElement).type == 'number')
            nm = 'value';
        M.c = mt!=MType.Prop && mt!=MType.Event || (nm=M.nm=CheckNm(elm, nm));
    }
    switch (mt) {
        case MType.Attr:
            elm.setAttribute(nm, val as string); 
            break;
        case MType.Src:
            elm.setAttribute('src',  new URL(val as string, nm).href);
            break;
        case MType.Prop:
            if (val==N && typeof elm[nm]=='string') val = '';
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case MType.Event:
            let m: RegExpMatchArray;
            if (val)
                if(m = /^on(input|change)$/.exec(nm)) {
                    elm.addEventListener(m[1], val as Handler);
                    (elm.hndlrs ||= []).push({evType: m[1], listener: val as Handler})
                }
                else {
                    elm[nm] = val; 
                    if (nm == 'onclick' && R.Settings.bSetPointer)
                        elm.style.cursor = val && !(elm as HTMLButtonElement).disabled ? 'pointer' : N;
                }
            break;
        case MType.Class:
            if (val)
                elm.classList.add(nm);
            break;
        case MType.Style:
            elm.style[nm] = val || (val === 0 ? '0' : N);
            break;
        case MType.AddToStyle:
            if (val) 
                for (let [nm,v] of Object.entries(val as Object))
                    elm.style[nm] = v || (v === 0 ? '0' : N);
            break
        case MType.AddToClassList:
            (function a(v: any) {
                if (v)
                    switch (typeof v) {
                        case 'string': elm.classList.add(v); break;
                        case 'object':
                            if (v)
                                if (Array.isArray(v)) 
                                    v.forEach(a);
                                else
                                    for (let [nm, b] of Object.entries(v as Object))
                                        if (b) a(nm);
                            break;
                        default: throw `Invalid value`;
                }
            })(val);
            break;
        case MType.RestArgument:
            for (let {M, value} of val as RestParameter || E)
                ApplyMod(elm, M, value, bCr);
            break;
        case MType.oncreate:
            if (bCr)
                (val as ()=>void).call(elm);
        case MType.onupdate:
            if (!bCr)
                (val as ()=>void).call(elm); 
            break;
    }
}
function ApplyMods(elm: HTMLElement, modifs: Modifier[], bCreate?: boolean) {
    // Apply all modifiers: adding attributes, classes, styles, events
    bRO= T;
    for (let M of modifs)
        try {
            let {depV} = M,
                value = depV.bThis ? depV.call(elm) : depV();    // Evaluate the dependent value in the current environment
            // See what to do with it
            ApplyMod(elm, M, value, bCreate)
        }
        catch (err) { throw `[${M.nm}]: ${err}` }
    
    bRO = F;
}

let RModules = new Map<string, Promise<[DOMBuilder,Map<string, [Signature,CKey]>]>>(),
   
/* Runtime data */
    env: Environment,       // Current runtime environment
    onerr: Handler & {      // Current error handler
        bBldr?: boolean     // True when the handler should be called on build errors as well
    },
    onsucc: Handler,        // Current onsuccess routine
    builtNodeCnt = 0,
    envActions: Array<() => void> = []
type EnvState = number;
function SaveEnv(): EnvState {
    return envActions.length;
}
function RestEnv(savedEnv: EnvState) { // Restore environment
    for (let j=envActions.length; j>savedEnv; j--)
        envActions.pop()();
}

let updCnt = 0;

class RCompiler {

    static iNum=0;
    public num = RCompiler.iNum++;

    private ctStr: string;
    private ctMap: Context;
    private ctLen: number;
    private ctSigns: Map<string, [Signature, CKey]>;
    private ctCCnt: number;

    private cRvars = new Map<string,boolean>();

    private doc: Document;
    private head: Node;
    private StyleBefore: ChildNode;
    public FilePath: string;
 
    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(
        RC?: RCompiler,
        FilePath?: string,
        bClr?: boolean,
    ) { 
        this.Settings   = RC ? {...RC.Settings} : {...defaults};
        RC ||= this;
        this.FilePath  = FilePath || RC.FilePath;
        this.doc = RC.doc || D
        this.head  = RC.head || this.doc.head;
        if (bClr) RC=this;
        this.ctStr    = RC.ctStr || "";
        this.ctMap = new Map(RC.ctMap);
        this.ctLen = RC.ctLen || 0;
        this.ctSigns = new Map(RC.ctSigns);
        this.ctCCnt = RC.ctCCnt || 0
        this.StyleBefore = RC.StyleBefore
    }

    private restoreActions: Array<() => void> = [];

    private SaveCont(): SavedContext {
        return this.restoreActions.length;
    }
    private RestoreCont(sv: SavedContext) {
        for (let j=this.restoreActions.length; j>sv; j--)
            this.restoreActions.pop()();
    }

    private newV(nm: string): LVar {
        let lv: LVar;
        if (!(nm = nm?.trim()))
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
           lv = dU as LVar;
        else {
            let {ctStr,ctLen,ctMap} = this,
                i = ctMap.get(CheckId(nm));

            this.restoreActions.push(() => {
                this.ctStr = ctStr;
                this.ctLen = ctLen;
                mapSet(ctMap, nm, i);
            });

            this.ctStr = ctStr.replace(new RegExp(`\\b${nm}\\b`), '') + nm + ',';
            ctMap.set(nm , this.ctLen++);

            lv =
                ((v: unknown, bUpd?: boolean) => {
                    if (!bUpd) envActions.push(() => {env.length=ctLen});
                    env[ctLen] = v;
                }) as LVar;
        }
        lv.nm = nm;
        return lv;        
    }
    private NewVars(varlist: string): Array<LVar> {
        return Array.from(split(varlist), nm => this.newV(nm));
    }

    private NewConstructs(listS: Iterable<Signature>) {
        let {ctCCnt, ctSigns} = this,
            prevCs: Array<[string, [Signature,CKey]]> = [];
        for (let S of listS) {
            prevCs.push([S.nm, ctSigns.get(S.nm)]);
            ctSigns.set(S.nm, [S, this.ctCCnt++]);
        }
        if (prevCs.length==0) return dU;
        this.restoreActions.push(() => {
            this.ctCCnt = ctCCnt;
            for (let [nm, CS] of prevCs)
                mapSet(ctSigns, nm, CS);
        });
        return (CDefs: Iterable<ConstructDef>) => {
            envActions.push(() => {                
                env.C.length = ctCCnt;
            })
            let i = ctCCnt
            for (let C of CDefs)
                env.C[i++] = C;
        }
    }

    // Compile a source tree into an ElmBuilder
    public async Compile(
        elm: ParentNode, 
        settings: Settings = {},
        childnodes?: Iterable<ChildNode>,  // Compile the element itself, or just its childnodes
    ) {
        let t0 = performance.now();
        ass(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.setPRE.add(tag.toLowerCase());
        this.Builder = childnodes
            ? await this.CompChildNodes(elm, childnodes)
            : (await this.CompElm(elm.parentElement, elm as HTMLElement, T))[0]
        this.bCompiled = T;
        this.logTime(`${this.num} Compiled ${this.srcNodeCnt} nodes in ${(performance.now() - t0).toFixed(1)} ms`);
    }

    logTime(msg: string) {
        if (this.Settings.bTiming)
            console.log(msg);
    }

    private setPRE = new Set<string>(['pre']);

    public async Build(area: Area) {
        let saveR = R;
        R = this;
        env = NewEnv();
        builtNodeCnt++;
        await this.Builder(area);
        R = saveR;        
    }

    public Settings: FullSettings;
    private Builder: DOMBuilder;
    public bCompiled: boolean;

    private wspc = WSpc.block;  // While compiling: whitespace mode for the node(s) to be compiled; see enum WSpc
    private rspc: booly = T;     // While compiling: may the generated DOM output be right-trimmed
    

    private srcNodeCnt = 0;   // To check for empty Content

    private async CompChildNodes(
        srcParent: ParentNode,
        childNodes: Iterable<ChildNode> = srcParent.childNodes,
    ): Promise<DOMBuilder> {
        let saved = this.SaveCont();
        try {
            let bldr = await this.CompIter(srcParent, childNodes);
            return bldr ?
                 async function ChildNodes(area) {
                    let savEnv = SaveEnv();
                    try { await bldr(area); }
                    finally { RestEnv(savEnv); }
                }
                : dumB;
        }
        finally { this.RestoreCont(saved); }
    }

    // Compile some stretch of childnodes
    private async CompIter(srcParent: ParentNode, iter: Iterable<ChildNode>): Promise<DOMBuilder> {
        type Triple = [
            DOMBuilder,         // Builder for a single childnode
            ChildNode,          // The source childnode
            (boolean|number)?   // true: this builder will only produce whitespace and does not modify 'env'
        ];
        let bldrs = [] as Array< Triple >
            , {rspc} = this     // Indicates whether the output may be right-trimmed
            , arr = Array.from(iter)
            , i=0;
        while(rspc && arr.length && reWS.test(arr[arr.length-1].nodeValue)) 
            arr.pop();

        for (let srcNode of arr) {
            this.rspc = ++i==arr.length && rspc;
            let bldr: Triple;
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    this.srcNodeCnt ++;
                    bldr = await this.CompElm(srcParent, srcNode as HTMLElement);
                    break;

                case Node.TEXT_NODE:
                    this.srcNodeCnt ++;
                    let str = srcNode.nodeValue;
                    
                    let getText = this.CompString( str ), {fixed} = getText;
                    if (fixed !== '') { // Either nonempty or undefined
                        bldr = 
                            [ fixed 
                                ? async (area: Area) => PrepCharData(area, fixed)
                                : async (area: Area) => PrepCharData(area, getText())
                            , srcNode
                            , fixed==' ' ];
                        
                        // Update the compiler whitespace mode
                        if (this.wspc < WSpc.preserve)
                            this.wspc = / $/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    break;

                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        let getText = this.CompString(srcNode.nodeValue, 'Comment');
                        bldr =
                            [ async (area:Area)=> PrepCharData(area, getText(), T), srcNode, 1]
                    }
                    break;
            }
                       
            if (bldr ? bldr[0].ws : this.rspc)
                prune();
            if (bldr) 
                bldrs.push(bldr);
        }
        function prune() {
            // Builders producing trailing whitespace are not needed
            let i = bldrs.length, isB: boolean|number;
            while (i-- && (isB= bldrs[i][2]))
                if (isB === T)
                    bldrs.splice(i, 1);
        }
        if (rspc)
            prune();

        if (!bldrs.length) return N;

        return addP(
            async function Iter(area: Area, start: number = 0)
                // start > 0 is used by auto-generated subscribers
            {                
                let i=0, toSubscribe: Array<[Subscriber,number]> = [];
                if (!area.rng) {
                    for (let [bldr] of bldrs) {
                        i++;
                        await bldr(area);
                        if (bldr.auto)  // Auto subscribe?
                            toSubscribe.push([Subscriber(area, Iter, area.prevR, i), (area.prevR.val as RVAR)._Subs.size]); // Not yet the correct range, we need the next range
                    }
                    for (let [subs,s] of toSubscribe) {
                        let {sArea} = subs, r = sArea.rng, rvar = r.val as RVAR;
                        if (rvar._Subs.size==s && r.next) // No new subscribers yet?
                        {   // Then auto-subscribe with the correct range
                            (sArea.rng = r.next).updated = updCnt;
                            rvar.Subscribe(rvar.auto = subs);
                        }
                    }
                } else
                    for (let [bldr] of bldrs)
                        if (i++ >= start) {
                            let r = area.rng;
                            await bldr(area);
                            if (bldr.auto && r.val?.auto)  // Auto subscribed?
                                assignEnv((r.val as RVAR).auto.env, env);
                        }
                
                builtNodeCnt += bldrs.length - start;
            },
            "ws", bldrs[0][0].ws);
    }

    private async CompElm(srcPrnt: ParentNode, srcElm: HTMLElement, bUnhide?: boolean
        ): Promise<[DOMBuilder, ChildNode, 1?]> {
        let // List of source attributes, to check for unrecognized attributes
            atts =  new Atts(srcElm),
            cl = this.ctLen,
            // (this)react(s)on handlers
            reacts: Array<{attNm: string, rvars: Dependent<RVAR[]>}> = [],
            // Generic pseudo-events to be handled BEFORE building
            bfor: Array<{attNm: string, txt: string, hndlr?: Dependent<Handler>, C: boolean, U: boolean, D: boolean}> = [],
            // Generic pseudo-events to be handled AFTER building
            after: Array<{attNm: string, txt: string, hndlr?: Dependent<Handler>, C: boolean, U: boolean, D: boolean}> = [],
            anyH: booly,     // Truthy when there is any before or after event hanldeer

            dIf: Dependent<boolean>,        // #if condition
            raLength = this.restoreActions.length,      // To check whether any definitions have been compiled
            
            // onerror handler to be installed
            dOnerr: Dependent<Handler> & {bBldr?: boolean},
            // onsuccess handler to be installed
            dOnsucc: Dependent<Handler>,
            
            // The intermediate builder will be put here
            bldr: DOMBuilder,
            // The final builder will be put here
            elmBldr: DOMBuilder,
            
            isBl: 1  // 1 when bldr won't produce output
            , m: RegExpExecArray, nm: string;
        if (bUnhide) atts.set('#hidden', 'false');        
        try {
            dIf = this.CompAttrExpr(atts, 'if');
            for (let attNm of atts.keys())
                if (m = genAtts.exec(attNm))
                    if (m[1])       // (?:this)?reacts?on)
                        reacts.push({attNm, rvars: this.compAttrExprList<RVAR>(atts, attNm, T)});
                    else {
                        let txt = atts.g(attNm);
                        if (nm = m[3])  // #?(before|after|on)(create|update|destroy)+
                            (m[2] ? bfor : after).push({attNm, txt, C:/c/i.test(nm), U:/u/i.test(nm), D:/y/i.test(nm) });
                        else { // #?on(?:(error)-?|success)
                            let hndlr = this.CompHandler(attNm, txt); 
                            if (m[5])   // #?onerror-?
                                ((dOnerr = hndlr) as typeof dOnerr).bBldr = !/-$/.test(attNm);
                            else dOnsucc = hndlr;
                        }
                    }
            // See if this node is a user-defined construct (component or slot) instance
            let constr = this.ctSigns.get(srcElm.localName);
            if (constr)
                bldr = await this.CompInstance(srcElm, atts, constr);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define': {
                        CheckNoChildren(srcElm);
                        let tv      = atts.g('tvar'),       // A two-way RVAR
                            rv      = !tv && atts.g('rvar'), // An RVAR
                            rtv     = rv || tv,
                            varNm   = rtv || atts.g('let') || atts.g('var', T),
                            // When we want a two-way rvar, we need a routine to update the source expression
                            dSet: Dependent<(x:any) => void>  
                                    = tv ? this.CompJScript(
                                            `$=>{${atts.get('#value')}=$}`
                                        )
                                        : dU,
                            dUpd    = rv && this.CompAttrExpr<RVAR>(atts, 'updates') || dU,
                            dVal    = this.CompParam(atts, 'value', tv) || dU,
                            dSto    = rv && this.CompAttrExpr<Store>(atts, 'store'),
                            dSNm    = dSto && this.CompParam<string>(atts, 'storename') || dU,
                            bReact  = atts.gB('reacting') || atts.gB('updating') || tv,
                            vLet    = this.newV(varNm);
                        bldr = async function DEF(this: RCompiler, area
                            , bReOn?: booly  // T when the DEF is re-evaluated due to a 'reacton' attribute
                             ) {
                            let {rng, bCr} = PrepArea(srcElm, area);
                            if (bCr || bReact || bReOn){
                                bRO=T;
                                let v = dVal();
                                if (rtv)
                                    if (bCr) {
                                        let rvUp = dUpd();
                                        rng.val = RVAR(
                                            rtv, v, dSto && dSto(),
                                            rvUp ? rvUp.SetDirty.bind(rvUp) : dSet(), 
                                            dSNm()
                                        );
                                    } else
                                        rng.val._Set(v);
                                else
                                    rng.val = v;
                                bRO=F;
                            }
                        
                            vLet(rng.val);
                        }

                        if (rv) {
                            // Check for compile-time subscribers
                            let a = this.cRvars.get(rv);    // Save previous value
                            this.cRvars.set(rv, T);
                            this.restoreActions.push(() => {
                                // Possibly auto-subscribe when there were no compile-time subscribers
                                if (elmBldr) elmBldr.auto = this.cRvars.get(rv);
                                this.cRvars.set(rv, a);
                            });
                        }
                        
                        isBl = 1;
                    } break;

                    case 'if':
                    case 'case': {
                        let bHiding = atts.gB('hiding'),
                            dVal = this.CompAttrExpr<string>(atts, 'value'),
                            caseNodes: Array<{
                                node: HTMLElement,
                                atts: Atts,
                                body: Iterable<ChildNode>,
                            }> = [],
                            body: ChildNode[] = [],
                            bThen: boolean;
                        
                        for (let node of srcElm.childNodes) {
                            if (node.nodeType == Node.ELEMENT_NODE) 
                                switch (node.nodeName) {
                                    case 'THEN':
                                        bThen = T;
                                        new Atts(node as HTMLElement).ChkNoAttsLeft();
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
                                atts.ChkNoAttsLeft();

                        let 
                            caseList: Array<{
                                cond?: Dependent<unknown>,
                                not: boolean,
                                patt?: {lvars: LVar[], regex: RegExp, url?: boolean},
                                bldr: DOMBuilder, 
                                node: HTMLElement,
                            }> = [],
                            {wspc, rspc}= this,
                            postWs: WSpc = 0; // Highest whitespace mode to be reached after any alternative
                        
                        for (let {node, atts, body} of caseNodes) {
                            let saved = this.SaveCont();
                            this.wspc = wspc; this.rspc = rspc;
                            try {
                                let cond: Dependent<unknown>, 
                                    not = T,
                                    patt:  {lvars: LVar[], regex: RegExp, url?: boolean},
                                    p: string;
                                switch (node.nodeName) {
                                    case 'IF':
                                    case 'THEN':
                                    case 'WHEN':
                                        cond = this.CompAttrExpr<unknown>(atts, 'cond');
                                        not = !atts.gB('not');
                                        patt =
                                            (p = atts.g('match')) != N
                                                ? this.CompPattern(p)
                                            : (p = atts.g('urlmatch')) != N
                                                ? this.CompPattern(p, T)
                                            : (p = atts.g('regmatch')) != N
                                                ?  {regex: new RegExp(p, 'i'), 
                                                lvars: this.NewVars(atts.g('captures'))
                                                }
                                            : N;

                                        if (bHiding && patt?.lvars.length)
                                            throw `Pattern capturing cannot be combined with hiding`;
                                        if (patt && !dVal)
                                            throw `Match requested but no 'value' specified.`;

                                        // Fall through!

                                    case 'ELSE':
                                        caseList.push({
                                            cond, not, patt,
                                            bldr: await this.CompChildNodes(node, body),
                                            node
                                        });
                                        atts.ChkNoAttsLeft();
                                        postWs = Math.max(postWs, this.wspc);
                                        continue;
                                }
                            } 
                            catch (err) { throw (node.nodeName=='IF' ? '' : OuterOpenTag(node)) + err; }
                            finally { this.RestoreCont(saved) }
                        }
                        this.wspc = postWs;

                        bldr = 
                            async function CASE(area: Area) {
                                let value = dVal && dVal()
                                    , choosenAlt: typeof caseList[0]
                                    , matchResult: RegExpExecArray;
                                for (let alt of caseList)
                                    try {
                                        if ( !(
                                            (!alt.cond || alt.cond()) 
                                            && (!alt.patt || value!=N && (matchResult = alt.patt.regex.exec(value)))
                                            ) != alt.not)
                                        { choosenAlt = alt; break }
                                    } catch (err) { 
                                        if (bHiding)
                                            for (let alt of caseList) PrepElm(alt.node, area);
                                        else
                                            PrepArea(srcElm, area, '', 1, choosenAlt);
                                        throw (alt.node.nodeName=='IF' ? '' : OuterOpenTag(alt.node)) + err }
                                if (bHiding) {
                                    // In this CASE variant, all subtrees are kept in place, some are hidden
                                        
                                    for (let alt of caseList) {
                                        let {rng, chArea, bCr} = PrepElm(alt.node, area);
                                        if (    (!(rng.node.hidden = alt != choosenAlt)
                                                || bCr
                                                )
                                             && !area.bRootOnly)
                                            await R.CallWithHandling(alt.bldr, alt.node, chArea );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    let {sub, bCr} = PrepArea(srcElm, area, '', 1, choosenAlt);
                                    if (choosenAlt && (!area.bRootOnly || bCr)) {
                                        let saved = SaveEnv(), i = 0;
                                        try {
                                            if (choosenAlt.patt)
                                                for (let lv of choosenAlt.patt.lvars)
                                                    lv(
                                                        (choosenAlt.patt.url ? decodeURIComponent : (r: string) => r)
                                                        (matchResult[++i])
                                                    );

                                            await R.CallWithHandling(choosenAlt.bldr, choosenAlt.node, sub );
                                        } finally { RestEnv(saved) }
                                    }
                                }
                        }
                    } break;
                            
                    case 'for':
                    case 'foreach':
                        bldr = await this.CompFor(srcElm, atts);
                    break;

                    case 'module': // Skip completely!
                        atts.g('id');
                        break;
                        
                    case 'include':
                        if (srcElm.children.length || srcElm.textContent.trim()) {
                            atts.g('src');
                            bldr = await this.CompChildNodes(srcElm);
                        }
                        else {
                            let src = atts.g('src', T)
                            // Placeholder that will contain a Template when the file has been received
                                , C: RCompiler = new RCompiler(this, this.GetPath(src))
                                , task = (async () => {
                                    // Parse the contents of the file
                                    // Compile the parsed contents of the file in the original context
                                    await C.Compile(N, {bRunScripts: T}, await this.fetchModule(src));
                                })();
                            bldr = 
                                // Runtime routine
                                async function INCLUDE(area) {
                                    let t0 = performance.now();
                                    await task;
                                    start += performance.now() - t0;
                                    await C.Builder(area);
                                };
                        }
                    break;

                    case 'import': {
                        let src = atts.g('src', T)
                            , bIncl = atts.gB('include')
                            , vars: Array<LVar & {i?:number}> = this.NewVars(atts.g('defines'))
                            , bAsync = atts.gB('async')
                            , listImps = new Array<Signature>()
                            , promModule = RModules.get(src);   // Check whether module has already been loaded
                        
                        for (let ch of srcElm.children) {
                            let sign = this.ParseSignat(ch);
                            listImps.push(sign);
                        }

                        let defConstructs = this.NewConstructs(listImps);
                            
                        if (!promModule) {
                            let C = new RCompiler(this, this.GetPath(src), T);
                            C.Settings.bRunScripts = T;

                            promModule = this.fetchModule(src).then(async nodes => {
                                let bldr = (await C.CompIter(N, nodes)) || dumB;

                                // Check or register the imported signatures
                                for (let clientSig of listImps) {
                                    let signat = C.ctSigns.get(clientSig.nm);
                                    if (!signat)
                                        throw `<${clientSig.nm}> is missing in '${src}'`;
                                    if (bAsync && !clientSig.IsCompatible(signat[0]))
                                        throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signat[0].srcElm.outerHTML}`;
                                }
                                for (let v of vars)
                                    if ((v.i = C.ctMap.get(v.nm)) == N)
                                        throw `Module does not define '${v.nm}'`;
                                        
                                return [bldr.bind(C), C.ctSigns];

                            });
                            RModules.set(src, promModule);
                        }
                        if (!bAsync) {
                            let prom = promModule.then(([ , CSigns]) => {
                                for (let sig of listImps)
                                    ass(sig, CSigns.get(sig.nm)[0]);
                            })
                            for (let sig of listImps)
                                sig.prom = prom;
                        }
                        
                        bldr = async function IMPORT(reg: Area) {
                            let [bldr, CSigns] = await promModule
                                , saveEnv = env
                                , MEnv = env = NewEnv();
                            await bldr(bIncl ? reg : {parN: D.createDocumentFragment()});
                            env = saveEnv;
                            
                            defConstructs(listImps.map(S => GetC(MEnv, CSigns.get(S.nm)[1])));
                                
                            for (let lv of vars)
                                lv(MEnv[lv.i]);
                        };
                        isBl = 1;

                    } break;

                    case 'react': {
                        let getRvars = this.compAttrExprList<RVAR>(atts, 'on', T)
                            , getHashes = this.compAttrExprList<unknown>(atts, 'hash')
                            , bodyBuilder = await this.CompChildNodes(srcElm);
                        
                        bldr = this.GetREACT(
                            srcElm, 'on'
                            , getRvars
                            , bodyBuilder
                            , atts.gB('renew'));

                        if (getHashes) {
                            let b = bldr;
                            bldr = async function HASH(area: Area) {
                                let {sub, rng} = PrepArea(srcElm, area, 'hash')
                                    , hashes = getHashes();

                                if (!rng.val || hashes.some((hash, i) => hash !== rng.val[i])) {
                                    rng.val = hashes;
                                    await b(sub);
                                }
                            }
                            bldr.ws = b.ws;
                        }
                    } break;

                    case 'rhtml': {
                        CheckNoChildren(srcElm);
                        let dSrctext = this.CompParam<string>(atts, 'srctext', T)
                        //  , imports = this.CompAttrExpr(atts, 'imports')
                            , modifs = this.CompAttribs(atts)
                            , lThis = this;
                        this.wspc=WSpc.block;
                        
                        bldr = async function RHTML(area) {
                            let src = dSrctext()
                            
                                , {rng, bCr} = PrepElm(srcElm, area, 'rhtml-rhtml')
                                , {node} = rng;
                            ApplyMods(node, modifs, bCr);

                            if (area.prevR || src != rng.res) {
                                rng.res = src;
                                let 
                                    svEnv = env,
                                    C = new RCompiler(N, lThis.FilePath),
                                    sRoot = C.head = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = D.createElement('rhtml'),
                                    sArea = {
                                        parN: sRoot, 
                                        rng: N, 
                                        parR: rng.child ||= new Range(N, N, 'Shadow')};

                                rng.child.erase(sRoot); sRoot.innerHTML='';
                                try {
                                    // Parsing
                                    tempElm.innerHTML = src;
                                    // Compiling
                                    await C.Compile(tempElm, {bRunScripts: T, bTiming: lThis.Settings.bTiming}, tempElm.childNodes);
                                    // Building
                                    await C.Build(sArea);
                                }
                                catch(err) {
                                    sRoot.appendChild(createErrNode(`Compile error: `+err))
                                }
                                finally { env = svEnv; }
                            }
                        };
                    } break;

                    case 'script': 
                        bldr = await this.CompScript(srcPrnt, srcElm as HTMLScriptElement, atts); 
                        isBl = 1;
                        break;

                    case 'style':
                        this.CompStyle(srcElm);
                        isBl = 1;
                        break;

                    case 'component':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBl = 1;
                        break;

                    case 'document': {
                        let docVar = this.newV(atts.g('name', T)),
                            RC = new RCompiler(this),
                            bEncaps = atts.gB('encapsulate'),
                            setVars = RC.NewVars(atts.g('params')),
                            winV = RC.newV(atts.g('window')),
                            docBldr = ((RC.head = D.createElement('DocumentFragment')), await RC.CompChildNodes(srcElm));
                        bldr = async function DOCUMENT(area: Area) {
                            let {rng, bCr} = PrepArea(srcElm, area, docVar.name);
                            if (bCr) {
                                let doc = area.parN.ownerDocument,
                                    docEnv = CloneEnv(env),
                                    wins = rng.wins = new Set();
                                rng.val = {
                                    async render(w: Window, bCr: boolean, args: unknown[]) {
                                        let svEnv = env, i = 0, D = w.document;
                                        env = docEnv;
                                        for (let lv of setVars)
                                            lv(args[i++]);
                                        winV(w);
                                        try {
                                            if (bCr) {
                                                // Copy all style sheet rules
                                                if (!bEncaps)
                                                    copyStyleSheets(doc, D);
                                                for (let S of RC.head.childNodes)
                                                    D.head.append(S.cloneNode(T));
                                            }
                                            let area: Area = {parN: D.body, rng: (w as any).rng};
                                            await docBldr(area);
                                        }
                                        finally {env = svEnv}
                                    },
                                    open(target?: string, features?: string, ...args: unknown[]) {
                                        let w = W.open('', target || '', features)
                                            , bCr = !childWins.has(w);
                                        if (bCr) {
                                            w.addEventListener('keydown', 
                                                function(this: Window,event:KeyboardEvent) {if(event.key=='Escape') this.close();}
                                            );
                                            w.addEventListener('close', () => childWins.delete(w), wins.delete(w))
                                            childWins.add(w); wins.add(w);
                                        }
                                        else
                                            w.document.body.innerHTML=''
                                        this.render(w, bCr, args);
                                        return w;
                                    },
                                    async print(...args: unknown[]) {
                                        let iframe = doc.createElement('iframe');
                                        iframe.hidden = T;
                                        doc.body.appendChild(iframe);
                                        await this.render(iframe.contentWindow, T, args);
                                        iframe.contentWindow.print();
                                        iframe.remove();
                                    },
                                    closeAll: () => {
                                        for (let w of wins)
                                            w.close();
                                    }
                                };
                            }
                            docVar(rng.val);
                        }
                        isBl = 1;
                    } break;

                    case 'rhead': {
                        let childBuilder = await this.CompChildNodes(srcElm), {wspc} = this;
                        this.wspc = this.rspc = WSpc.block;
                        
                        bldr = async function HEAD(area: Area) {
                            let {sub} = PrepArea(srcElm, area);
                            sub.parN = area.parN.ownerDocument.head;
                            sub.bfor = N;
                            await childBuilder(sub);
                            if (sub.prevR)
                                sub.prevR.parN = sub.parN;
                        }
                        this.wspc = wspc;
                        isBl = 1;
                    } break;

                    case 'rstyle':
                        let save: [boolean, RegExp, WSpc] = [this.Settings.bDollarRequired, this.regIS, this.wspc];

                        this.Settings.bDollarRequired = T; this.regIS = N;
                        this.wspc = WSpc.preserve;
                        let childnodesBldr = await this.CompChildNodes(srcElm);

                        [this.Settings.bDollarRequired, this.regIS, this.wspc] = save;
                        
                        bldr = async function RSTYLE(this: RCompiler, area: Area) {
                            let {chArea} = PrepElm(srcElm, area, 'STYLE');
                            await childnodesBldr(chArea);
                        };
                        isBl = 1;
                        break;

                    case 'element':                        
                        bldr = await this.CompHTMLElement(srcElm, atts
                            , this.CompParam(atts, 'tagname', T)
                        );
                        this.wspc = WSpc.inline;
                        break;

                    case 'attribute':
                        CheckNoChildren(srcElm);
                        let dNm = this.CompParam<string>(atts, 'name', T),
                            dVal= this.CompParam<string>(atts, 'value', T);
                        bldr = async function ATTRIB(this: RCompiler, area: Area){
                            let nm = dNm(),
                                {rng} = PrepArea(srcElm, area);
                            if (rng.val && nm != rng.val)
                                (area.parN as HTMLElement).removeAttribute(rng.val);
                            if (rng.val = nm)
                                (area.parN as HTMLElement).setAttribute(nm, dVal());
                        };
                        isBl = 1;
                        break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        bldr = await this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.ChkNoAttsLeft();
            }

            for (let g of concIter(bfor, after))
                anyH = g.hndlr = this.CompHandler(g.attNm, g.txt);
        }
        catch (err) { 
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
        if (!bldr) return N;
        let {ws} = bldr;
        if (dOnerr || dOnsucc) {
            let b = bldr;
            bldr = async function SetOnError(area: Area) {
                let save = {onerr, onsucc};
                try {
                    if (dOnerr) 
                        ((onerr = dOnerr()) as typeof onerr).bBldr = dOnerr.bBldr;
                    if (dOnsucc)
                        onsucc = dOnsucc();
                    await b(area);
                }
                finally { ({onerr,onsucc} = save); }
            }
        }
        if (anyH) {
            let b = bldr;
            bldr = async function ON(area: Area) {
                let r = area.rng, bfD: Handler;
                for (let g of bfor) {
                    if (g.D && !r)
                        bfD = g.hndlr();
                    if (r ? g.U : g.C)
                        g.hndlr().call(
                            r && r.node || area.parN
                        );
                }
                await b(area);
                if (bfD)
                    area.prevR.bfDest = bfD;
                for (let g of after) {
                    if (g.D && !r)
                        area.prevR.onDest = g.hndlr();
                    if (r ? g.U : g.C)
                        g.hndlr().call(
                            (r ? r.node : area.prevR?.node) || area.parN
                        );
                }
            }
        }
        if (dIf) {
            if (this.restoreActions.length > raLength)
                throw `'#IF' is not possible for declarations`;
            let b = bldr;
            bldr = function hif(area: Area) {
                let c = dIf(),
                    {sub} = PrepArea(srcElm, area, '#if', 1, !c)
                if (c)
                    return b(sub)
            }
        }

        for (let {attNm, rvars} of reacts)
            bldr = this.GetREACT(srcElm, attNm, rvars, bldr);

        return [elmBldr = addP(
            this.ctLen == cl
            ? function Elm(area: Area) {
                return R.CallWithHandling(bldr, srcElm, area);
            }
            : function Elm(area: Area) {
                return bldr(area).catch((err: string) => {throw `${OuterOpenTag(srcElm, 40)} ${err}`})
            }
            , 'ws',ws), srcElm, isBl];
    }

    private GetREACT(
        srcElm: HTMLElement, 
        attName: string, 
        getRvars: Dependent<RVAR[]>,
        builder: DOMBuilder, 
        bRenew?: boolean
    ): DOMBuilder{
        let  updateBuilder: DOMBuilder = 
            ( bRenew
                ? function renew(sub: Area) {
                    return builder(PrepArea(srcElm, sub, 'renew', 2).sub);
                }
            : /^this/.test(attName)
                ? function reacton(sub: Area) {
                    sub.bRootOnly = T;
                    return builder(sub, T);
                }
            : builder
            );

        return addP(
            async function REACT(area: Area) {
                
                let {rng, sub, bCr} = PrepArea(srcElm, area, attName);

                await builder(
                    bRenew ? PrepArea(srcElm, sub, 'renew', 2).sub : sub
                    );

                // Any RVARs to react on?
                if (getRvars) {
                    let rvars = getRvars()
                        , subs: Subscriber, pVars: RVAR[]
                        , i = 0;
                    if (bCr)
                        // Create new subscriber
                        subs = rng.subs = Subscriber(sub, updateBuilder, rng.child, T);
                    else {
                        // Update the existing subscriber to work with a new environment
                        ({subs, rvars: pVars} = rng);
                        if(!subs) return;   // Might happen in case of errors during Create
                        assignEnv(subs.env, env);
                    }
                    rng.rvars = rvars;
                    rng.val = sub.prevR?.val;
                    for (let rvar of rvars) {
                        if (pVars) {
                            let pvar = pVars[i++];
                            if (rvar==pvar)
                                continue;
                            pvar._Subs.delete(subs);
                        }
                        try { rvar.Subscribe(subs); }
                        catch { throw `[${attName}] This is not an RVAR`; }
                    }
                }
            },
            "ws", builder.ws);
    }

    private async CallWithHandling(builder: DOMBuilder, srcNode: ChildNode, area: Area){
        let {rng} = area;
        if (rng && rng.errNode) {
            area.parN.removeChild(rng.errNode);
            rng.errNode = U;
        }
        try {
            return await builder(area);
        } 
        catch (err) { 
            let message = 
                srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;

            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (onerr?.bBldr)
                onerr(err);
            else if (this.Settings.bShowErrors) {
                let errNode =
                    area.parN.insertBefore(createErrNode(message), area.rng?.FirstOrNext);
                if (rng)
                    rng.errNode = errNode;    /*  */
            }
        }
    }

    private async CompScript(srcParent: ParentNode, srcElm: HTMLScriptElement, atts: Atts) {
        //srcParent.removeChild(srcElm);
        let {type, text, defer, async} = srcElm
            , src = atts.g('src')     // Niet srcElm.src
            , defs = atts.g('defines')
            , bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type)
            , bCls = /^((text|application)\/javascript)?$/i.test(type)
            , mOto = /^otoreact(\/((local)|static))?\b/.exec(type)
            , sLoc = mOto && mOto[2]
            , bUpd = atts.gB('updating')
            , varlist = [...split(defs)]
            , {ctStr: context} = this
            , lvars = sLoc && this.NewVars(defs)
            , exp: Array<unknown>
            , defNames = lvars ? 
                function() {
                    let i=0;
                    for (let lv of lvars)
                        lv(exp[i++]);
                }
                : function() {
                    let i=0;
                    for (let nm of varlist)
                        G[nm] = exp[i++];
                }
            ;
        
        atts.clear();

        if (this.Settings.bRunScripts && (bMod || bCls) || mOto) {
            if (mOto && mOto[3]) {
                let prom = (async () => gEval(`'use strict';([${context}])=>{${src ? await this.FetchText(src) : text}\n;return[${defs}]}`))();
                return async function LSCRIPT(area: Area) {
                    let {rng, bCr} = PrepArea(srcElm, area);
                    exp = bUpd || bCr ? rng.res = (await prom)(env) : rng.res
                    defNames();
                }
            } 
            else if (bMod) {
                let prom: Promise<Object> =
                    src 
                    ? import(this.GetURL(src))
                    : import(
                        src = URL.createObjectURL(
                            new Blob(
                                [ text.replace(
                                    /(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g,
                                    (_, p1, p2, p3) => `${p1}${this.GetURL(p2)}${p3}`
                                ) ]
                                , {type: 'text/javascript'}
                            )
                        )
                    ).finally(() => URL.revokeObjectURL(src));
                return async function MSCRIPT() {
                    if (!exp) {
                        let e = await prom;
                        exp = varlist.map(nm => {
                            if (!(nm in e))
                                throw `'${nm}' is not exported by this script`;
                            return e[nm];
                        })
                    }
                    defNames();
                }
            }
            else {
                let prom = (async() => `${mOto ? "'use strict';":""}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    // Evaluate asynchronously as soon as the script is fetched
                    prom = prom.then(txt => void (exp = gEval(txt)));
                else if (!mOto && !defer)
                    // Evaluate standard classic scripts without defer immediately
                    exp = gEval(await prom);

                return async function SCRIPT() {
                        let txt = await prom;
                        if (!exp)
                            exp = gEval(txt);
                        defNames();
                    };
            }
        }
    }

    public async CompFor(this: RCompiler, srcElm: HTMLElement, atts: Atts): Promise<DOMBuilder> {
        let letNm = atts.g('let') ?? atts.g('var')
            , idxNm = atts.g('index')
            , saved = this.SaveCont();
        if (idxNm == '') idxNm = 'index';
        this.rspc = F;
        try {
            if (letNm != N) { /* A regular iteration */
                let prevNm = atts.g('previous')
                    , nextNm = atts.g('next');
                if (prevNm == '') prevNm = 'previous';
                if (nextNm == '') nextNm = 'next';
                
                let getRange =
                    this.CompAttrExpr<Iterable<Item> | Promise<Iterable<Item>>>
                    (atts, 'of', T
                    // Check for being iterable
                    , iter => iter && !(Symbol.iterator in iter || Symbol.asyncIterator in iter)
                                && `Value (${iter}) is not iterable`
                    ),
                dUpd = this.CompAttrExpr<RVAR>(atts, 'updates'),
                bReact = atts.gB('reacting') || atts.gB('reactive') || !!dUpd,
            
                // Voeg de loop-variabele toe aan de context
                vLet = this.newV(letNm),
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                vIdx = this.newV(idxNm),
                vPrev = this.newV(prevNm),
                vNext = this.newV(nextNm),

                dKey = this.CompAttrExpr<Key>(atts, 'key'),
                dHash = this.CompAttrExpr<Hash>(atts, 'hash'),

                // Compileer alle childNodes
                bodyBldr = await this.CompChildNodes(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, area: Area) {
                    let {rng, sub} = PrepArea(srcElm, area, ''),
                        {parN} = sub,
                        bfor = sub.bfor !== U ? sub.bfor : rng.Next,
                        iterable = getRange() || E
                    
                        , pIter = async (iter: Iterable<Item>) => {
                        let svEnv = SaveEnv();
                        try {
                            // Map of previous data, if any
                            let keyMap: Map<Key, Range> = rng.val ||= new Map(),
                            // Map of the newly obtained data
                                nwMap: Map<Key, {item:Item, hash:Hash, idx: number}> = new Map();
                            vLet(); vIdx();

                            let idx=0;
                            for await (let item of iter) {
                                vLet(item,T);
                                vIdx(idx,T);
                                let hash = dHash && dHash()
                                    , key = dKey?.() ?? hash;
                                if (key != N && nwMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                nwMap.set(key ?? {}, {item, hash, idx: idx++});
                            }

                            let nxChR = rng.child,
                                iterator = nwMap.entries(),
                                nextIter = nextNm ? nwMap.values() : N

                                , prItem: Item, nxItem: Item
                                , prRange: Range = N,
                                chArea: Area;
                            sub.parR = rng;
                            vPrev(); vNext();

                            if (nextIter) nextIter.next();

                            while(T) {
                                let k: Key, nx = iterator.next();
                                while (nxChR && !nwMap.has(k = nxChR.key)) {
                                    if (k != N)
                                        keyMap.delete(k);
                                    nxChR.erase(parN);
                                    if (nxChR.subs)
                                        nxChR.rvars[0]._Subs.delete(nxChR.subs);
                                    nxChR.prev = N;
                                    nxChR = nxChR.next;
                                }

                                if (nx.done) break;
                                let [key, {item, hash, idx}] = nx.value
                                    , chRng = keyMap.get(key)
                                    , bCr = !chRng;

                                if (nextIter)
                                    nxItem = nextIter.next().value?.item;

                                if (bCr) {
                                    // Item has to be newly created
                                    sub.rng = N;
                                    sub.prevR = prRange;
                                    sub.bfor = nxChR?.FirstOrNext || bfor;
                                    ({rng: chRng, sub: chArea} = PrepArea(N, sub, `${letNm}(${idx})`));
                                    if (key != N) {
                                        if (keyMap.has(key))
                                            throw `Duplicate key '${key}'`;
                                        keyMap.set(key, chRng);
                                    }
                                    chRng.key = key;
                                }
                                else {
                                    // Item already occurs in the series
                                    
                                    if (chRng.fragm) {
                                        parN.insertBefore(chRng.fragm, nxChR?.FirstOrNext || bfor);
                                        chRng.fragm = N;
                                    }
                                    else
                                        while (T) {
                                            if (nxChR == chRng)
                                                nxChR = nxChR.next;
                                            else {
                                                // Item has to be moved
                                                if (nwMap.get(nxChR.key)?.idx > idx + 2) {
                                                    let fr = nxChR.fragm = D.createDocumentFragment();
                                                    for (let node of nxChR.Nodes())
                                                        fr.appendChild(node);
                                                    
                                                    nxChR = nxChR.next;
                                                    continue;
                                                }

                                                chRng.prev.next = chRng.next;
                                                if (chRng.next)
                                                    chRng.next.prev = chRng.prev;
                                                let nxNode = nxChR?.FirstOrNext || bfor;
                                                for (let node of chRng.Nodes())
                                                    parN.insertBefore(node, nxNode);
                                            }
                                            break;
                                        }

                                    chRng.next = nxChR;
                                    chRng.text = `${letNm}(${idx})`;

                                    if (prRange) 
                                        prRange.next = chRng;
                                    else
                                        rng.child = chRng;
                                    sub.rng = chRng;
                                    chArea = PrepArea(N, sub, '').sub;
                                    sub.parR = N;
                                }
                                chRng.prev = prRange;
                                prRange = chRng;

                                if (hash == N
                                    ||  hash != chRng.hash as Hash
                                        && (chRng.hash = hash, T)
                                ) {
                                    // Environment instellen
                                    if (bReact && (bCr || item != chRng.rvars[0]))
                                    {
                                        RVAR_Light<Item>(item, dUpd && [dUpd()]);
                                        if (chRng.subs)
                                            item._Subs = chRng.rvars[0]._Subs 
                                    }
                                    
                                    vLet(item,T);
                                    vIdx(idx,T);
                                    vPrev(prItem,T);
                                    vNext(nxItem,T);

                                    // Body berekenen
                                    await bodyBldr(chArea);

                                    if (bReact)
                                        if (chRng.subs)
                                            assignEnv(chRng.subs.env, env);
                                        else {
                                            (item as RVAR_Light<Item>).Subscribe(
                                                chRng.subs = Subscriber(chArea, bodyBldr, chRng.child)
                                            );
                                            chRng.rvars = [item as RVAR];
                                        }
                                }

                                prItem = item;
                            }
                            if (prRange) prRange.next = N; else rng.child = N;
                        }
                        finally { RestEnv(svEnv) }
                    }

                    if (iterable instanceof Promise) {
                        let subEnv = {env: CloneEnv(env), onerr,  onsucc};
                        rng.rvars = [RVAR(N, iterable, N, rng.subs = 
                            async iter => {
                                let save = {env, onerr, onsucc};
                                ({env, onerr, onsucc} = subEnv);
                                try { await pIter(iter as Iterable<Item>); }
                                finally {({env, onerr, onsucc} = save)}
                            }
                        )];
                    }
                    else
                        await pIter(iterable);
                };
            }
            else { 
                /* Iterate over multiple slot instances */
                let nm = atts.g('of', T, T).toLowerCase(),
                    CS = this.ctSigns.get(nm);

                if (!CS)
                    // Slot doesn't exist; it's probably a missing 'let'
                    throw `Missing attribute [let]`;

                let ck: CKey = CS[1],
                    ixVar = this.newV(idxNm),
                    bodyBldr = await this.CompChildNodes(srcElm);
                //srcParent.removeChild(srcElm);

                return async function FOREACH_Slot(this: RCompiler, area: Area) {
                    let {sub} = PrepArea(srcElm, area),
                        saved= SaveEnv(),
                        slotDef = env.C[ck];
                    ixVar();
                    try {
                        let idx = 0;
                        for (let slotBldr of slotDef.templates) {
                            ixVar(idx++, T);
                            env.C[ck] = {nm: nm, templates: [slotBldr], CEnv: slotDef.CEnv};
                            await bodyBldr(sub);
                        }
                    }
                    finally {
                        env.C[ck] =  slotDef;
                        RestEnv(saved);
                    }
                }
            }
        }
        finally { this.RestoreCont(saved) }
    }

    private ParseSignat(elmSignat: Element, bIsSlot?: boolean):  Signature {
        let signat = new Signature(elmSignat, bIsSlot), s: Signature;
        for (let attr of elmSignat.attributes) {
            if (signat.RestP) 
                throw `Rest parameter must be the last`;
            let m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                let param = { 
                    mode: m[1]
                    , nm: m[2]
                    , pDflt:
                        m[1] == '...' ? () => E
                        : attr.value != '' 
                        ? (m[1] == '#' ? this.CompJScript(attr.value, attr.name) :  this.CompString(attr.value, attr.name))
                        : m[3] ? /^on/.test(m[2]) ? ()=>_=>N : dU   // Unspecified default
                        : N 
                    }
                signat.Params.push(param);
                if (m[1] == '...')
                    signat.RestP = param;
            }
        }
        for (let elmSlot of elmSignat.children) {
            mapNm(signat.Slots, s = this.ParseSignat(elmSlot,T));
            if (/^content/.test(s.nm)) {
                if (signat.CSlot) throw 'Multiple content slots';
                signat.CSlot = s;
            }
        }
        return signat;
    }

    private async CompComponent(srcElm: HTMLElement, atts: Atts): Promise<DOMBuilder> {

        let bldr: DOMBuilder,
            bRecurs = atts.gB('recursive'),
            {wspc} = this
            , signats: Array<Signature> = []
            , templates: Array<ConstructDef> = []
            , {head}=this
            , encStyles = atts.gB('encapsulate') && (this.head = srcElm.ownerDocument.createDocumentFragment()).children
            , save = this.SaveCont();

        try {
            let arr = Array.from(srcElm.children) as Array<HTMLElement>
                , elmSign = arr.shift()
                , elmTempl = arr.pop() ;

            if (!elmSign) throw 'Missing signature(s)';
            if (!elmTempl || !/^TEMPLATES?$/.test(elmTempl.nodeName))
                throw 'Missing template(s)';

            for (let elm of /^SIGNATURES?$/.test(elmSign.nodeName) ? elmSign.children : [elmSign])
                signats.push(this.ParseSignat(elm));

            if (bRecurs)
                this.NewConstructs(signats);

            bldr = await this.CompIter(srcElm, arr)
            
            let mapS = new Map<string, Signature>(signats.map(S => [S.nm, S]));
            async function AddTemp(RC: RCompiler, nm: string, prnt: ParentNode, elm: HTMLElement) {
                let S = mapS.get(nm);
                if (!S) throw `<${nm}> has no signature`;
                templates.push({nm, templates: [ await RC.CompTempl(S, prnt, elm, F, encStyles) ]})
                mapS.delete(nm);
            }
            if (/S/.test(elmTempl.nodeName)) // <TEMPLATES> ?
                // Each child is a template
                for (let elm of elmTempl.children as Iterable<HTMLElement>)
                    await AddTemp(this, elm.localName, elm, elm);
            else
                // All content forms one template
                await AddTemp(this, signats[0].nm, (elmTempl as HTMLTemplateElement).content, elmTempl);
            for (let nm of mapS.keys())
                throw `Signature <${nm}> has no template`;
        }
        finally { this.RestoreCont(save); this.head = head; }

        let DefConstrs = this.NewConstructs(signats);

        this.wspc = wspc;

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return async function COMPONENT(area: Area) {
            let constr: ConstructDef[] = templates.map(C => ({...C}));  // C must be cloned, as it will receive its own environment
            if (bRecurs)
                DefConstrs(constr);
            let saved = SaveEnv();
            try {
                bldr && await R.CallWithHandling(bldr, srcElm, area);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs
                let CEnv = CloneEnv(env);
                for(let c of constr)
                    c.CEnv = CEnv;
            }
            finally { RestEnv(saved) }
            if (!bRecurs)
                DefConstrs(constr);
        };
    }

    private async CompTempl(signat: Signature, contentNode: ParentNode, srcElm: HTMLElement, 
        bIsSlot?: boolean, encStyles?: Iterable<Node>, atts?: Atts
    ): Promise<Template>
    {
        let 
            saved = this.SaveCont();
        try {
            let 
                myAtts = atts || new Atts(srcElm),
                lvars: Array<[string, LVar]> =
                    signat.Params.map(
                        ({mode,nm}) => [nm, this.newV((myAtts.g(mode + nm) ?? myAtts.g(nm, bIsSlot)) || nm)]
                    ),
                DC = this.NewConstructs(signat.Slots.values());

            if (!atts)
                myAtts.ChkNoAttsLeft();
            this.wspc = this.rspc = WSpc.block;
            let
                builder = await this.CompChildNodes(contentNode),
                Cnm = signat.nm,
                custNm = /^[A-Z].*-/.test(Cnm) ? Cnm : `rhtml-${Cnm}`;

            return async function TEMPLATE(area: Area, args: unknown[], mSlotTemplates, slotEnv
                ) {
                let saved = SaveEnv(), i = 0;
                try {
                    // Set parameter values as local variables
                    for (let [nm,lv] of lvars){
                        let arg = args[nm], dflt: Dependent<unknown>;
                        if (arg===U && (dflt = signat.Params[i]?.pDflt))
                            arg = dflt();
                        lv(arg);
                        i++;
                    }
                    // Define all slot-constructs
                    DC(mapIter(mSlotTemplates, 
                        ([nm, templates]) => ({nm, templates, CEnv: slotEnv, Cnm})
                    ));

                    if (encStyles) {
                        let {rng: elmRange, chArea, bCr} = PrepElm(srcElm, area, custNm), 
                            elm = elmRange.node,
                            shadow = elm.shadowRoot || elm.attachShadow({mode: 'open'});
                        if (bCr)
                            for (let style of encStyles)
                                shadow.appendChild(style.cloneNode(T));
                        
                        if (signat.RestP)
                            ApplyMod(elm, {mt: MType.RestArgument, nm: N, depV: null}, args[signat.RestP.nm], bCr);
                        chArea.parN = shadow;
                        area = chArea;
                    }
                    await builder(area); 
                }
                finally { RestEnv(saved) }
            }
        }
        catch (err) {throw `${OuterOpenTag(srcElm)} template: ${err}` }
        finally { this.RestoreCont(saved) }
    }


    private async CompInstance(
        srcElm: HTMLElement, atts: Atts,
        [signat,ck]: [Signature, CKey]
    ) {
        if (signat.prom)
            await signat.prom;
        let {nm, RestP, CSlot} = signat,
            getArgs: Array<[string,Dependent<unknown>,Dependent<Handler>?]> = [],
            SBldrs = new Map<string, Template[]>();

        for (let [nm] of signat.Slots)
            SBldrs.set(nm, []);

        for (let {mode, nm, pDflt} of signat.Params)
            if (mode=='@') {
                let attVal = atts.g(mode+nm, !pDflt);
                getArgs.push(
                    attVal
                    ? [nm, this.CompJScript<unknown>(attVal, mode+nm)
                        , this.CompJScript<Handler>(`ORx=>{${attVal}=ORx}`, nm)
                    ]
                    : [nm, U, ()=>dU ]
                )
            }
            else if (mode != '...') {
                let dH = this.CompParam(atts, nm, !pDflt);
                if (dH) getArgs.push([nm, dH]);
            }

        let slotElm: HTMLElement, slot: Signature;
        for (let node of Array.from(srcElm.children))
            if ((slot = signat.Slots.get((slotElm = (node as HTMLElement)).localName))
                && slot != CSlot
                ) {
                SBldrs.get(slotElm.localName).push(
                    await this.CompTempl(slot, slotElm, slotElm, T)
                );
                srcElm.removeChild(node);
            }
            
        if (CSlot)
            SBldrs.get(CSlot.nm).push(
                await this.CompTempl(CSlot, srcElm, srcElm, T, N, atts)
            );

        if (RestP) {
            let modifs = this.CompAttribs(atts);
            getArgs.push([
                RestP.nm, 
                () => modifs.map(M => ({M, value: M.depV()})) as RestParameter
            ]);
        }
        
        atts.ChkNoAttsLeft();
        this.wspc = WSpc.inline;

        return async function INSTANCE(this: RCompiler, area: Area) {
            let IEnv = env,
                {rng, sub, bCr} = PrepArea(srcElm, area),
                cdef = GetC(env, ck),
                args = rng.res ||= {};
            if (!cdef) return;  //In case of an async imported component, where the client signature has less slots than the real signature
            bRO = T;
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bCr)
                    args[nm] = RVAR('', dGet && dGet(), N, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            
            bRO = F;
            env = cdef.CEnv;
            try {
                //for (let {nm, pDflt} of signat.Params) if (args[nm] === u) args[nm] = pDflt();
                for (let template of cdef.templates) 
                    await template(sub, args, SBldrs, signat.bIsSlot && signat.Slots.size ? CloneEnv(IEnv) : IEnv);
            }
            finally {env = IEnv;}
        }
    }

    private async CompHTMLElement(srcElm: HTMLElement, atts: Atts,
            dTagName?: Dependent<string>
        ) {
        // Remove trailing dots
        let nm = dTagName ? N : srcElm.localName.replace(/\.+$/, ''),
            // Remember preceeding whitespace-mode
            preWs = this.wspc
            // Whitespace-mode after this element
            , postWs: WSpc;

        if (this.setPRE.has(nm)) {
            this.wspc = WSpc.preserve; postWs = WSpc.block;
        }
        else if (reBlock.test(nm))
            this.wspc = this.rspc = postWs = WSpc.block;
        
        else if (reInline.test(nm)) {  // Inline-block
            this.wspc = this.rspc = WSpc.block;
            postWs = WSpc.inline;
        }
        
        if (preWs == WSpc.preserve)
            postWs = preWs;

        // We turn each given attribute into a modifier on created elements
        let modifs = this.CompAttribs(atts)

        // Compile the given childnodes into a routine that builds the actual childnodes
            , childnodesBldr = await this.CompChildNodes(srcElm);

        if (postWs)
            this.wspc = postWs;

        // Now the runtime action
        let bldr: DOMBuilder = 
        async function ELEMENT(this: RCompiler, area: Area) {
            let {rng: {node}, chArea, bCr} = PrepElm(srcElm, area, nm || dTagName());
            
            if (!area.bRootOnly)
                // Build children
                await childnodesBldr(chArea);

            node.removeAttribute('class');
            if (node.hndlrs) {
                for (let {evType, listener} of node.hndlrs)
                    node.removeEventListener(evType, listener);
                node.hndlrs = [];
            }
            ApplyMods(node, modifs, bCr);
        };

        bldr.ws = postWs == WSpc.block 
                || preWs < WSpc.preserve && childnodesBldr.ws;
        // true when whitespace befóre this element may be removed

        return bldr;
    }

    private CompAttribs(atts: Atts) { 
        let modifs: Array<Modifier> = []
            , m: RegExpExecArray;
        function addM(mt: MType, nm: string, depV: Dependent<unknown>){
            modifs.push({mt, nm, depV});
        }

        for (let [nm, V] of atts) {
            try {
                if (m = /(.*?)\.+$/.exec(nm))
                    addM(MType.Attr, nm, this.CompString(V, nm));

                else if (m = /^on(.*?)\.*$/i.exec(nm))               // Events
                    addM(MType.Event, m[0],
                        this.AddErrH(this.CompHandler(nm, V))
                    );
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    addM(MType.Class, m[1],
                        this.CompJScript<boolean>(V, nm)
                    );
                else if (m = /^(#)?style\.(.*)$/.exec(nm))
                    addM(MType.Style, CapitalProp(m[2]),
                        m[1] ? this.CompJScript<unknown>(V, nm) : this.CompString(V, nm)
                    );
                else if (nm == '+style')
                    addM(MType.AddToStyle, nm,
                        this.CompJScript<object>(V, nm)
                    );
                else if (nm == "+class")
                    addM(MType.AddToClassList, nm,
                        this.CompJScript<object>(V, nm)
                    );
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) { // #, *, !, !!, combinations of these, @ = #!, @@ = #!!
                    let nm = altProps[m[2]] || m[2]
                        , setter: Dependent<Handler>;
                    if (m[1] != '#')
                        try {
                            let dS = this.CompJScript<(a:any) => void>(`$=>{${V}=$}`), cnm: string;
                            setter = () => {
                                let S = dS();
                                return function(this: HTMLElement) {
                                    S(this[cnm ||= CheckNm(this, nm)])
                                }
                            }
                        }
                        catch(err) { throw `Invalid left-hand side '${V}'`} 
                    
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript<Handler>(V, nm);
                        if (/^on/.test(nm))
                            addM(MType.Event, nm, this.AddErrH(depV as Dependent<Handler>));
                        else
                            addM(MType.Prop, nm, depV);
                    }
                    if (/\*/.test(m[1]))
                        addM(MType.oncreate, nm, setter);
                    if (/\+/.test(m[1]))
                        addM(MType.onupdate, nm, setter);
                    if (/[@!]/.test(m[1]))
                        addM(MType.Event, /!!|@@/.test(m[1]) ? 'onchange' : 'oninput', 
                            setter);         
                }
                else if (m = /^\.\.\.(.*)/.exec(nm)) {
                    if (V) throw 'A rest parameter cannot have a value';
                    addM(MType.RestArgument, nm, this.CompName(m[1]) );
                }
                else if (nm == 'src')
                    addM(MType.Src, this.FilePath, this.CompString(V, nm) );
                else
                    addM(MType.Attr, nm, this.CompString(V, nm) );
            }
            catch (err) {
                throw(`[${nm}]: ${err}`)
            }
        }
        atts.clear();
        return modifs;
    }

    private CompStyle(srcStyle: HTMLElement)  {
        this.head.appendChild(srcStyle);
    }

    private regIS: RegExp;
    private CompString(data: string, nm?: string): Dependent<string> & {fixed?: string} {
        let 
            // Regular expression to recognize string interpolations, with or without dollar,
            // with support for two levels of nested braces,
            // were we also must take care to skip js strings possibly containing braces and escaped quotes.
            // Backquoted js strings containing js expressions containing backquoted strings might go wrong
            // (We can't use negative lookbehinds; Safari does not support them)
            regIS = this.regIS ||= 
                new RegExp(
                    /(\\[${])|/.source
                    + (this.Settings.bDollarRequired ? /\$/ : /\$?/).source
                    + /\{((\{(\{.*?\}|.)*?\}|'(\\'|.)*?'|"(\\"|.)*?"|`(\\`|.)*?`|\\\}|.)*?)\}|$/.source
                    , 'gs'
                ),
            gens: Array< string | Dependent<unknown> > = [],
            ws: WSpc = nm || this.Settings.bKeepWhiteSpace ? WSpc.preserve : this.wspc
            , isTriv = T, bThis: boolean
            , lastIndex = regIS.lastIndex = 0
            , dep: Dependent<string> & {fixed?: string}
            , m: RegExpExecArray;

        while (T)
            if (!(m = regIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.slice(lastIndex, m.index) : N;
                if (fixed) {
                    fixed = fixed.replace(/\\([${}\\])/g, '$1'); // Replace '\{' etc by '{'
                    if (ws < WSpc.preserve) {
                        fixed = fixed.replace(/[ \t\n\r]+/g, ' ');  // Reduce whitespace
                        // We can't use \s for whitespace, because that includes nonbreakable space &nbsp;
                        if (ws <= WSpc.inlineSpc && !gens.length)
                            fixed = fixed.replace(/^ /,'');     // No initial whitespace
                        if (this.rspc && !m[2] && regIS.lastIndex == data.length)
                            fixed = fixed.replace(/ $/,'');     // No trailing whitespace
                    }
                    if (fixed) gens.push( fixed );  
                }
                if (lastIndex == data.length)
                    break;
                if (m[2]) {
                    let getS = this.CompJScript<string>(m[2], nm, '{}');
                    gens.push( getS );
                    isTriv = F;
                    bThis ||= getS.bThis;
                }
                lastIndex = regIS.lastIndex;
            }
        
        if (isTriv) {
            let s = (gens as Array<string>).join('');
            ((dep = () => s) as any).fixed = s
        } else
            dep = 
                function(this: HTMLElement) {
                    try {
                        let s = "";
                        for (let gen of gens)
                            s +=
                                typeof gen == 'string' ? gen
                                : (bThis ? gen.call(this) : gen()) ?? '';
                        
                        return s;
                    }
                    catch (err) { throw nm ? `[${nm}]: ${err}` : err }
                }
        dep.bThis = bThis;
        return dep;
    }

    // Compile a 'regular pattern' into a RegExp and a list of bound LVars
    private CompPattern(patt:string, url?: boolean): {lvars: LVar[], regex: RegExp, url: boolean}
    {
        let reg = '', lvars: LVar[] = []
        
        // These are the subpatterns that are need converting; all remaining characters are literals and will be quoted when needed
        , regIS =
            /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;

        while (regIS.lastIndex < patt.length) {
            let lastIndex = regIS.lastIndex
                , m = regIS.exec(patt)
                , literals = patt.slice(lastIndex, m.index);

            if (literals)
                reg += quoteReg(literals);
            reg +=
                m[1]     // A capturing group
                    ? (lvars.push(this.newV(m[1])), `(.*?)`)
                : m[0] == '?'   ? '.'
                : m[0] == '*'   ? '.*'
                : m[2]          ? m[2] // An escaped character
                                : m[0] // A character class or "\{"
        }

        return {lvars, regex: new RegExp(`^${reg}$`, 'i'), url}; 
    }

    private CompParam<T = unknown>(atts: Atts, attName: string, bReq?: booly): Dependent<T> {
        let v = atts.g(attName);
        return (
            v == N ? this.CompAttrExpr<T>(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandler(attName, v) as Dependent<any>
            : this.CompString(v, attName) as Dependent<any>
        );
    }
    private CompAttrExpr<T>(atts: Atts, attName: string, bReq?: booly
        , check?: (t:T) => string   // Additional check
        ) {
        return this.CompJScript<T>(atts.g(attName, bReq, T),attName, U, check);
    }

    private CompHandler(nm: string, text: string) {
        return /^#/.test(nm) ? this.CompJScript<Handler>(text, nm)
            : this.CompJScript<Handler>(`function(event){${text}\n}`, nm)
    }
    private CompJScript<T>(
        expr: string           // Expression to transform into a function
        , descrip?: string             // To be inserted in an errormessage
        , delims: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
        , check?: (t:T) => string   // Additional check
    ): Dependent<T> {
        if (expr == N) return N;

        let bThis = /\bthis\b/.test(expr),
            depExpr = bThis ?
                `'use strict';(function expr([${this.ctStr}]){return (${expr}\n)})`
                : `'use strict';([${this.ctStr}])=>(${expr}\n)`
            , desc = `${descrip?`[${descrip}] `:''}${delims[0]}${Abbr(expr,60)}${delims[1]}: `;

        try {
            let rout = gEval(depExpr) as (env:Environment) => T;
            return addP(
                check
                    ? () => {
                        try {
                            let t = rout(env), m = check(t);
                            if (m) throw m;
                            return t;
                        }
                        catch (err) { throw desc + err; }
                    }
                : bThis
                    ? function (this: HTMLElement) {
                            try { return rout.call(this, env); } 
                            catch (err) { throw desc + err; }
                        }
                : () => {
                        try { return rout(env); } 
                        catch (err) { throw desc + err; }
                    }
                , "bThis", bThis);
        }
        catch (err) { throw desc + err }             // Compiletime error
    }
    private CompName(nm: string): Dependent<unknown> {
        let i = this.ctMap.get(nm);
        if (i==N) throw `Unknown name '${nm}'`;
        return () => env[i];
    }
    private compAttrExprList<T>(atts: Atts, attName: string, bReacts?: boolean): Dependent<T[]> {
        let list = atts.g(attName, F, T);
        if (list==N) return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars.set(nm, F);
        return this.CompJScript<T[]>(`[${list}\n]`, attName);
    }

    private AddErrH(getHndlr: Dependent<Handler>): Dependent<Handler> {
        return () => {
            let hndlr = getHndlr()
                , oE = onerr, oS = onsucc;
            return (hndlr && (oE||oS)
                ? function hError(this: HTMLElement, ev: Event) {
                    try {
                        let r = hndlr.call(this,ev);
                        if (r instanceof Promise)
                            return r.then(oS && (v => (oS(ev),v)), oE);
                        if (oS) oS(ev);
                        return r;
                    }
                    catch (err) {
                        if (!oE) throw err;
                        oE(err);
                    }
                }
                : hndlr
            );
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

    async fetchModule(src: string): Promise<Iterable<ChildNode>> {
        let m = D.getElementById(src);
        if (!m) {
            let d = parser.parseFromString(await this.FetchText(src), 'text/html') as Document,
                b = d.body,
                e = b.firstElementChild as HTMLElement;
            if (e?.tagName != 'MODULE')
                return concIter(d.head.childNodes, b.childNodes);

            m = e;
        }
        else if (m.tagName != 'MODULE')
            throw `#${src} must be a <MODULE>`;
        return m.childNodes;
    }
}

export async function RFetch(input: RequestInfo, init?: RequestInit) {
    let r = await fetch(input, init);
    if (!r.ok)
        throw `${init?.method || 'GET'} ${input} returned ${r.status} ${r.statusText}`;
    return r;
}
// Quote a string such that it can be literally included in a RegExp
function quoteReg(fixed: string) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}

// Class to manage the set of attributes of an HTML source element.
class Atts extends Map<string,string> {
    constructor(elm: HTMLElement) {
        super();
        for (let a of elm.attributes)
            if (!/^_/.test(a.name))
                super.set(a.name, a.value);
    }

    public g(nm: string, bReq?: booly, bHashAllowed?: booly) {
        let m = nm, v = super.get(m);
        if (v==N && bHashAllowed)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute [${nm}]`;
        return v;
    }
    public gB(nm: string): boolean { 
        let v = this.g(nm),
            m = /^((false)|true)?$/i.exec(v);
        if (v!=N) {
            if (!m) throw `@${nm}: invalid value`;
            return !m[2];
        }
    }

    // Check that there are no unrecognized attributes left!
    public ChkNoAttsLeft() {
        super.delete('hidden'); // Hidden may be added to any construct, so it remains hidden until compiled
        if (super.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}

let // Property namesto be replaced
    altProps = {"class": "className", for: "htmlFor"}
    // Generic attributes
    , genAtts = /^#?(?:((?:this)?reacts?on)|(?:(before)|on|after)((?:create|update|destroy)+)|on((error)-?|success))$/
    // Valid identifiers
    , reIdent = /^[A-Z_$][A-Z0-9_$]*$/i
    // Reserved words
    , reReserv = /^(break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/

// Capitalization of (just) style property names.
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
// Better not use lookbehind assertions (https://caniuse.com/js-regexp-lookbehind):
    , words = 'accent|additive|align|angle|animation|ascent|aspect|auto|back(drop|face|ground)|backface|behavior|blend|block|border|bottom|box|break|caption|caret|character|clip|color|column(s$)?|combine|conic|content|counter|css|decoration|display|emphasis|empty|end|feature|fill|filter|flex|font|forced|frequency|gap|grid|hanging|hue|hyphenate|image|initial|inline|inset|iteration|justify|language|left|letter|line(ar)?|list|margin|mask|masonry|math|max|min|nav|object|optical|outline|overflow|padding|page|paint|perspective|place|play|pointer|rotate|position|print|radial|read|repeating|right|row(s$)?|ruby|rule|scale|scroll(bar)?|shape|size|snap|skew|skip|speak|start|style|tab(le)?|template|text|timing|top|touch|transform|transition|translate|underline|unicode|user|variant|variation|vertical|viewport|white|will|word|writing|^z'
    , reCapit = new RegExp(`(${words})|.`, "g")

    // Elements that trigger block mode; whitespace before/after is irrelevant
    , reBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/
    // Elements that trigger inline mode
    , reInline = /^(button|input|img)$/
    // Whitespace
    , reWS = /^[ \t\n\r]*$/;

function CheckId(nm: string) {
    // Check valid JavaScript identifier
    if (!reIdent.test(nm)) throw `Invalid identifier '${nm}'`;
    if (reReserv.test(nm)) throw `Reserved keyword '${nm}'`;
    return nm;
}
// Properly capitalize a Style property
function CapitalProp(nm: string) {
    let b: boolean;
    return nm.replace(reCapit, (w, w1) => {
        let r = b ? w.slice(0,1).toUpperCase() + w.slice(1) : w;
        b = w1;
        return r;
    });
}

let Cnames: {[nm: string]: string} = {};
// Check whether object obj has a property named like attribute name nm, case insensitive,
// and returns the properly cased name; otherwise return nm.
function CheckNm(obj: object, nm: string): string {
    if (Cnames[nm]) return Cnames[nm];  // If checked before, return the previous result
    let r = new RegExp(`^${nm}$`, 'i'); // (nm cannot contain special characters)
    if (!(nm in obj))
        for (let pr in obj)
            if (r.test(pr))
                {nm = pr; break;}
    return Cnames[nm] = nm;
}

function OuterOpenTag(elm: HTMLElement, maxLen?: number): string {
    return Abbr(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLen-1) + '>';
}
function Abbr(s: string, m: number) {
    return (m && s.length > m
        ? s.slice(0, m - 3) + "..."
        : s);
}
function LAbbr(s: string, m: number = 1000) {
    return (m && s.length > m
        ? "... " + s.slice(s.length - m + 4)
        : s);
}

function mapNm<V extends {nm: string}>(m: Map<string, V>, v:V) {
    m.set(v.nm,v);
}
function mapSet<V>(m: Map<string, V>, nm: string, v:V) {
    if (v)
        m.set(nm,v);
    else
        m.delete(nm);
}

function* concIter<T>(R: Iterable<T>, S:Iterable<T>)  {
    for (let x of R) yield x;
    for (let x of S) yield x;
}
function* mapIter<A, B>(I: Iterable<A>, f: (a:A)=>B): Iterable<B> {
    for (let x of I)
        yield f(x);
}

function* split(s: string) {
    if (s)
        for (let v of s.split(',')) {
            v = v.trim();
            if (v) yield v;
        }        
}

function addP<T extends object, P extends string, V>(t:T, p: string, v: V): T & {[p in P]: V} {
    t[p] = v;
    return t as T & {[p in P]: V};
}

function createErrNode(msg: string) {
    let e = D.createElement('div'), s = e.style;        
    s.color = 'crimson'; s.fontFamily = 'sans-serif'; s.fontSize = '10pt';
    e.innerText = msg;
    return e;
}
function CheckNoChildren(srcElm: HTMLElement) {
    for (let node of srcElm.childNodes)
    if (srcElm.childElementCount
        || node.nodeType==Node.TEXT_NODE && !reWS.test(node.nodeValue)
        )
        throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
}

function copyStyleSheets(S: Document, D: Document) {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules) 
            DSheet.insertRule(rule.cssText);
    }
}


export function* range(from: number, count?: number, step: number = 1) {
	if (count === U) {
		count = from;
		from = 0;
	}
	for (let i=0;i<count;i++)
		yield from + i * step;
}

export let 
    R = new RCompiler(),
    docLocation: RVAR<string> & 
        {   basepath: string;
            subpath: string; 
            searchParams: URLSearchParams;
            search(key: string, value: string): string;
            getSearch(key: string): string;
            setSearch(key: string, value: string): void;
            RVAR(key: string, ini?: string, varNm?: string): RVAR<string>;
        }
        = RVAR<string>('docLocation', location.href) as any,
    reroute = 
        (arg: MouseEvent | string) => {
            if (typeof arg == 'object') {
                if (arg.ctrlKey)
                    return;
                arg.preventDefault();
                arg = (arg.target as HTMLAnchorElement).href;
            }
            docLocation.V = new URL(arg, location.href).href;
        };

ass(
    G, {RVAR, range, reroute, RFetch, debug: ()=>{debugger;}}
);

ass(docLocation, {
    search(key: string, val: string) {
        let url = new URL(location.href);
        if (val == N)
            url.searchParams.delete(key);
        else
            url.searchParams.set(key, val);
        return url.href;
    },
    getSearch(this: typeof docLocation, key: string) {
        return this.searchParams.get(key);
    },
    setSearch(this: typeof docLocation, key: string, val: string) {
        this.V = this.search(key, val);
    },
    RVAR(this: typeof docLocation, key: string, ini?: string, varNm: string = key) {
        let R = RVAR<string>(varNm, N, N,
            v => docLocation.setSearch(key, v));
        docLocation.Subscribe(() => {R.V = this.getSearch(key) ?? ini}, T);
        return R;
    }
});
Object.defineProperty(docLocation, 'subpath', {get: () => location.pathname.slice(docLocation.basepath.length)});

docLocation.Subscribe( loc => {
    if (loc != location.href)
        history.pushState(N, N, loc);
    
    docLocation.searchParams = new URLSearchParams(location.search);
    ScrollToHash();
}, T);

W.addEventListener('popstate', () => {docLocation.V = location.href;} );

function ScrollToHash() {
    if (location.hash)
        setTimeout((() => D.getElementById(location.hash.slice(1))?.scrollIntoView()), 6);
}

setTimeout(() =>
    /^rhtml$/i.test(D.body.getAttribute('type'))
        && RCompile()
, 0);