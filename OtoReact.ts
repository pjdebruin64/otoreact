// Global settings 
const
    U = undefined, N = null, T = true, F = false, E = [], 
    W = window, D = document, L = location,
    G = // Polyfill for globalThis
        W.globalThis || ((W as any).globalThis = W.self),
    defaults = {
        bTiming:        F,
        bAbortOnError:  F,      // Abort processing on runtime errors,
                                // When false, only the element producing the error will be skipped
        bShowErrors:    T,      // Show runtime errors as text in the DOM output
        bSubfile:    F,
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
    ass = Object.assign,
    now = () => performance.now(),

    dU: Dependent<any> = () => U,       // Undefined dependent value
    dumB: DOMBuilder = async _ => {},   // A dummy DOMBuilder

    // Child windows to be closed when the app is closed
    childWins = new Set<Window>(),
    // Map of all Otoreact modules that are being fetched and compiled, so they won't be fetched and compiled again
    RModules = new Map<string, Promise<[DOMBuilder, Context]>>();

// Type used for truthy / falsy values
type booly = boolean|string|number|object;

// Current whitespace mode of the compiler:
const enum WSpc {
    block = 1,      // We are in block mode; whitespace is irrelevant
    inlineSpc,      // We are in inline mode with trailing whitespace, so more whitespace can be skipped
    inline,         // We are in inline mode, whitespace is relevant
    preserve        // Preserve all whitespace
}

/* For any HTMLElement we create, we remember which event handlers have been added,
    So we can remove them when needed */
type hHTMLElement = HTMLElement & {
    hndlrs?: Array<{evType: string, listener: Handler}>
};

/* A DOMBUILDER is the semantics of a piece of RHTML.
    It can both build (construct, create) a new range of DOM, and update an earlier created range of DOM.
    The created DOM is yielded in 'ar.r'.
*/
type DOMBuilder = ((ar: Area, ...args: any[]) => Promise<void>) 
    & {
        ws?: boolean;   // True when the builder won't create any DOM other than blank text
        auto?: LVar<RVAR>; /* When defined, the DOMBuilder will create an RVAR that MIGHT need auto-subscribing. */
    };


/* An AREA is a (runtime) place to build or update a piece of DOM, with all required information a builder needs.
    Area's are transitory objects; discarded after the builders are finished
*/
type Area = {
    r?: Range,          // Existing piece of DOM
    // When undefined or null, the DOM has to be CREATED
    // When defined, the DOM has to be UPDATED

    parN: Node;            // DOM parent node
    bfor?: ChildNode;     // DOM node before which new nodes are to be inserted

    /* When !r, i.e. when the DOM has to be created: */
    srcN?: ChildNode;     // Optional source node to be replaced by the new DOM 
    parR?: Range;         // The new range shall either be the first child of some range,
    prevR?: Range;        // Or the next sibling of some other range

    /* When r, i.e. when the DOM has to be updated: */
    bR?: boolean,  // true == just update the root node, not its children
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
        ar: Area,             // Area where the new range is to be inserted
        node: NodeType,         // Optional DOM node
        public text?: string,   // Description, used only for comments
    ) {
        this.node = node;
        if (ar) {
            let p =  ar.parR, q = ar.prevR;
            if (p && !p.node)
                // Set the parent range, only when that range isn't a DOM node
                this.parR = p;
            
            // Insert this range in a linked list, as indicated by 'ar'
            if (q) 
                q.next = this;
            else if (p)
                p.child = this;
        
            // Update the area, so the new range becomes its previous range
            ar.prevR = this;
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

    errN?: ChildNode;  // When an error description node has been inserted, it is saved here, so it can be removed on the next update

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
                for (let rv of ch.rvars)
                    rv._Subs.delete(ch.subs);
            if (ch.onDest)  // Call 'ondestroy' handler
                ch.onDest.call(ch.node || par);
            ch = ch.next;
        }
    }
}

// An ENVIRONMENT holds the current values of all variables and construct definitions.
// It is organized as a linked list of frames, where each frame is an array, and its first element is the parent frame.
type Environment =  [Environment?, ...unknown[] ];
// An Env(ironment) Key points to a value in an environment. It consists of a frame number and an array index.
type EnvKey = [number, number];

class Context {
    d: number;          // Depth = number of parent frames
    L: number;          // Length = number of array elements
    M: number;          // Number of negative (construct) array elements
    ct: string;         // String of all visible variable names, to match against an environment
    varMap: Map<string, EnvKey>   // Mapping of visible varnames to EnvKeys
    csMap:  Map<string, [Signature, EnvKey]>; // Mapping of visible construct names to their signature and EnvKey

    constructor(C?: Context, b?: booly) {
        ass(
            this,
            C || {
                d: 0, L: 0, M: 0, ct: '',
                varMap: new Map(), csMap: new Map()
            }
        );
        if (b && C) {
            this.varMap = new Map(this.varMap.entries());
            this.csMap = new Map(this.csMap.entries())
        }
    }
    
    max(C: Context) {
        return ass(
            C.L > this.L ? C : this, 
            {N: Math.min(this.M, C.M)})
    }
}
function getV(D: number, env: Environment, [F,i]: EnvKey): unknown {
    let e = env
    for(;F < D; F++)
        e = e[0];
    return e[i];
}


// A  DEPENDENT value of type T in a given context is a routine computing a T, using the current environment (env) for that context.
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dependent<T> = (() => T);

/* The following function prepares a sub area of a given 'area', 
    containing (when creating) a new Range,
    AND updates 'area' to point to the next range in a linked list.

    It can assign some custom result value to the range,
    and on updating it can optionally erase the range, either when the result value has changed or always.
*/
function PrepArea(
    srcE: HTMLElement,  // Source element, just for error messages
    ar: Area,         // Given area
    text: string = '',  // Optional text for error messages
    nWipe?: 1|2,    // 1=erase 'ar.r' when 'res' has changed; 2=erase always
    res?: any,      // Some result value to be remembered
) : {
    r: Range,     // The newly created or updated child range
    sub: Area,       // The new sub area
    bCr: booly    // True when the sub-range has to be created
}
{
    let {parN, r, bR} = ar,  // Initially 'r' is the parent range
        sub: Area = {parN, r: N, bR }
        , bCr = !r;
    if (bCr) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        if (srcE) text = srcE.tagName + (text && ' ') + text;
        
        (r = sub.parR = new Range(ar, N, text)).res = res;
    }
    else {
        sub.r = r.child;
        ar.r = r.next;

        if (bCr = nWipe && (nWipe>1 || res != r.res)) {
            r.res = res;
            (sub.parR = r).erase(parN); 
            sub.r = N;
            sub.bfor = r.Next;
        }
    }
    
    return {r, sub, bCr};
}

/*
    Prepare a sub area of a given 'area',
    and on creating insert a new HTMLElement.

    On updating, update 'area' to point to the next range.
*/
function PrepElm<T={}>(
    srcE: HTMLElement, 
    ar: Area, 
    tag = srcE.tagName
): {
    r: Range<hHTMLElement> & T    // Sub-range
    , chAr: Area                    // Sub-area
    , bCr: boolean                  // True when the sub-range is being created
} {
    let r = ar.r as Range<HTMLElement> & T,
        bCr = !r;
    if (bCr)
        r = new Range(ar,
            ar.srcN == srcE
                ? (srcE.innerHTML = "", srcE)
                : ar.parN.insertBefore<HTMLElement>(
                    D.createElement(tag), ar.bfor
                )
            ) as Range<HTMLElement> & T;
    else
        ar.r = r.next;

    nodeCnt++
    return { 
        r, 
        chAr: {
            parN: r.node, 
            r: r.child, 
            bfor: N,
            parR: r
        },
        bCr
    };
}

/*
    Prepare a sub area of a given 'area',
    and on creating insert either a comment or a text node.

    On updating, update 'area' to point to the next range.
*/
function PrepCharData(ar: Area, content: string, bComm?: boolean) {
    let r = ar.r as Range<CharacterData>;
    if (!r)
        new Range(ar,
            ar.parN.insertBefore(
                bComm ? D.createComment(content) : D.createTextNode(content)
                , ar.bfor)
        );
    else {
        r.node.data = content;
        ar.r = r.next;
    }
    nodeCnt++;
}

type FullSettings = typeof defaults;
type Settings = Partial<FullSettings>;

export async function RCompile(elm: HTMLElement = D.body, settings?: Settings): Promise<void> { 
    try {
        let {basePattern} = R.Settings = {...defaults, ...settings},
            m = L.href.match(`^.*(${basePattern})`);
        R.FilePath = L.origin + (
            DL.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : ''
        )
        await R.Compile(elm);

        // Initial build
        start = now();
        nodeCnt = 0;
        let ar: Area = {parN: elm.parentElement, srcN: elm, r: N};
        await R.Build(ar);
        W.addEventListener('pagehide', ()=>childWins.forEach(w=>w.close()));
        R.log(`Built ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (e) {    
        alert(`OtoReact error: `+LAbbr(e));
    }
}

function NewEnv(): Environment { 
    return [N] as Environment;
}

type Subscriber<T = unknown> = ((t?: T) => (unknown|Promise<unknown>)) &
    {   sAr?: Area;
        bImm?: boolean;
    };

type ParentNode = HTMLElement|DocumentFragment;

type Handler = (ev:Event) => any;

// Inside a builder routine, a local variable is represented by a routine to set its value,
// having additional properties 'nm' with the variable name and 'i' with its index position in the environment 'env'
type LVar<T=unknown> = ((value?: T) => T) & {nm: string};
// Setting multiple LVars at once
function SetLVars(vars: Array<LVar>, data: Array<unknown>) {
    vars.forEach((v,i) => v(data[i]));
}

// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {mode: string, nm: string, pDflt: Dependent<unknown>};
// A SIGNATURE describes an RHTML user construct: a component or a slot
class Signature {
    constructor(
        public srcElm: Element        
    ){ 
        this.nm = srcElm.tagName;
    }
    public nm: string;
    public Params: Array<Parameter> = [];   // Parameters
    public RP: Parameter;            // Rest parameter (is also in Params)
    public Slots = new Map<string, Signature>();
    public CSlot: Signature;    // Content slot (is also in Slots)
    public bCln: booly;       // truthy when instances need to clone their environment

    // In case of a non-async <import>, details of the signature will initially be missing, and the compilation of instances shall await this promise for the signature to be completed
    public prom: Promise<any>;              

    // Check whether an import signature is compatible with the real module signature
    IsCompat(sig: Signature): booly {
        if (!sig) return ;
        let c = <booly>T,
            mParams = new Map(mapI(sig.Params,p => [p.nm, !!p.pDflt]));
        // All parameters in the import must be present in the module
        for (let {nm, pDflt} of this.Params)
            if (mParams.has(nm)) {
                // When optional in the import, then also optional in the module
                c &&= (!pDflt || mParams.get(nm));
                mParams.delete(nm);
            }
            else c = F
        // Any remaining module parameters must be optional
        for (let pDflt of mParams.values())
            c &&= pDflt;

        // All slots in the import must be present in the module, and these module slots must be compatible with the import slots
        for (let [nm, slotSig] of this.Slots)
            c &&= sig.Slots.get(nm)?.IsCompat(slotSig);
        
        return c;
    }
}

// A CONSTRUCTDEF is a concrete instance of a signature
type ConstructDef = {
    nm: string,          // Name of the construct
    tmplts: Template[],  // Template, or in case of a slot construct, possibly multiple templates
    CEnv?: Environment,  // Environment at the point the construct was declared
    Cnm?: string  // In case of a slot construct: the component name to which the slot belongs
};
/*
*/
type Template = 
    (args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment, ar: Area)
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
        public storeName?: string,
    ) {
        if (name) G[name] = this;
        
        let s = store && store.getItem(this._sNm), t= initial;
        if (s)
            try {
                this.v = JSON.parse(s);
                return;
            }
            catch{}

        t instanceof Promise ?
            t.then(v => this.V = v, onerr)
            : (this.v = t)
    }
    // The value of the variable
    private v: T = U;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    _Subs: Set<Subscriber<T>> = new Set();
    auto: Subscriber;
    private get _sNm() {
        return this.storeName || R.Settings.storePrefix + this.name;
    }

    Subscribe(s: Subscriber<T>, bImmediate?: boolean, bCr: boolean = bImmediate) {
        if (s) {
            if (bCr)
                s(this.v);
            s.bImm = bImmediate;
            this._Subs.add(s);
        }
        return this;
    }
    Unsubscribe(s: Subscriber<T>) {
        this._Subs.delete(s);
    }
    // Use var.V to get or set its value
    get V() { return this.v }
    // When setting, it will be marked dirty.
    set V(t: T) {
        if (t !== this.v) {
            this.v = t;
            this.SetDirty();
        }
    }
    get Set() {
        return (t: T | Promise<T>): T | Promise<T> =>
            t instanceof Promise ?
                ( (this.V = U), t.then(v => this.V = v, onerr))
                : (this.V = t);
    }
    get Clear() {
        return _ => 
            DVars.has(this) || (this.V=U);
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { 
        if (!ro) this.SetDirty();  
        return this.v }
    set U(t: T) { this.v = t; this.SetDirty(); }

    public SetDirty() {
        let b:boolean;
        for (let sub of this._Subs)
            if (sub.bImm)
                sub(this.v);
            else b=T;
        if (b || this.store) {
            DVars.add(this);
            RUpdate();
        }
    }

    public Save() {
        this.store.setItem(this._sNm, JSON.stringify(this.v ?? N));
    }

    toString() {
        return this.v.toString();
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

        
function Subscriber({parN, bR}: Area, bldr: DOMBuilder, r: Range, arg?: any ): Subscriber {
    if (r) r.updated = updCnt;
    let sAr: Area = {parN, bR, r }, // No parR (parent range); this is used by DEF()
        subEnv = {env, onerr, onsuc};

    return ass(
        async _ => {
            let r = sAr.r;
            if (!r || r.updated < updCnt)
            {
                ({env, onerr, onsuc} = subEnv);
                if (r && !bR) r.updated = updCnt;
                nodeCnt++;
                await bldr({...sAr}, arg);
            }
        }
        , {sAr});
}

let    
/* Runtime data */
    env: Environment,       // Current runtime environment
    onerr: Handler & {      // Current error handler
        bBldr?: boolean     // True when the handler should be called on build errors as well
    },
    onsuc: Handler,        // Current onsuccess routine

    // Dirty variables, which can be either RVAR's or RVAR_Light
    DVars = new Set<{_Subs: Set<Subscriber>; store?: any; Save?: () => void}>(),

    bUpdating: boolean,     // True while we are in the update-loop
    hUpdate: number,        // Handle to a scheduled update
    ro: boolean = F,    // True while evaluating element properties so RVAR's should not be set dirty

    updCnt = 0,       // Iteration count of the update loop; used to make sure a DOM element isn't updated twice in the same iteration
    nodeCnt = 0,      // Count of the number of nodes
    start: number;    // Timer

function RUpdate() {
    if (!bUpdating && !hUpdate)
        hUpdate = setTimeout(DoUpdate, 5);
}

export async function DoUpdate() {
    hUpdate = N;
    if (!R.bCompiled || bUpdating)
    return;

    bUpdating = T;
    try {
    nodeCnt = 0;
    start = now();
    while (DVars.size) {
        updCnt++;
        let dv = DVars;
        DVars = new Set();
        for (let rv of dv) {
            if (rv.store)
                rv.Save();
            for (let subs of rv._Subs)
                if (!subs.bImm)
                    try { 
                        await subs(rv instanceof _RVAR ? rv.V : rv); 
                    }
                    catch (e) {    
                        console.log(e = `ERROR: `+LAbbr(e));
                        alert(e);
                    }
        }
    }
    R.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
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
    return new _RVAR<T>(
        nm, value, store, storeName
    ).Subscribe(subs, T, F);
}

function RVAR_Light<T>(
    t: T, 
    updTo?: Array<RVAR>,
): RVAR_Light<T> {
    if (!(t as RVAR_Light<T>)._Subs) {
        (t as RVAR_Light<T>)._Subs = new Set();
        (t as RVAR_Light<T>)._UpdTo = updTo;
        Object.defineProperty(t, 'U',
            {get:
                () => {
                    if (!ro) {
                        DVars.add(t as RVAR_Light<T>);
                        if ((t as RVAR_Light<T>)._UpdTo?.length)
                            for (let rvar of (t as RVAR_Light<T>)._UpdTo)
                                rvar.SetDirty();
                        else
                            RUpdate();
                    }
                    return t;
                }
            }
        );
        (t as RVAR_Light<T>).Subscribe = sub => (t as RVAR_Light<T>)._Subs.add(sub);
    }
    return (t as RVAR_Light<T>);
}

interface Item {}  // Three unknown but distinguished types, used by the <FOR> construct
interface Key {}
interface Hash {}

const enum MType {
    Attr, Prop, Src, Class, Style, Event, 
    AddToStyle, AddToClassList, RestArgument,
    oncreate, onupdate
}
type Modifier = {
    mt: MType,
    nm: string,
    c?: booly   // Truthy when nm has been checked for proper casing
    depV: Dependent<unknown>,
}
type RestParameter = Array<{M: Modifier, v: unknown}>;

/* Apply modifier 'M' with actual value 'val' to element 'elm'.
    'bCr' is true when the element is newly created. */
function ApplyMod(elm: hHTMLElement, M: Modifier, val: unknown, bCr: boolean) {
    let {mt, nm} = M;
    if (!M.c) {
        // Replace setting 'valueasnumber' in '<input type=number @valueasnumber=...' by setting 'value'
        if (mt == MType.Prop && nm=='valueasnumber' && (elm as HTMLInputElement).type == 'number')
            nm = 'value';
        // For properties and events, find the correct capitalization of 'nm'.
        M.c = mt!=MType.Prop && mt!=MType.Event || (nm=M.nm=ChkNm(elm, nm));
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
            val && elm.classList.add(nm);
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
            (function ACL(v: any) {
                if (v)
                    switch (typeof v) {
                        case 'string': elm.classList.add(v); break;
                        case 'object':
                            if (v)
                                if (Array.isArray(v)) 
                                    v.forEach(ACL);
                                else
                                    for (let [nm, b] of Object.entries(v as Object))
                                        b && ACL(nm);
                            break;
                        default: throw `Invalid value`;
                }
            })(val);
            break;
        case MType.RestArgument:
            for (let {M, v} of val as RestParameter || E)
                ApplyMod(elm, M, v, bCr);
            break;
        case MType.oncreate:
            bCr && (val as ()=>void).call(elm);
            break;
        case MType.onupdate:
            !bCr && (val as ()=>void).call(elm); 
            break;
    }
}
function ApplyMods(elm: HTMLElement, modifs: Modifier[], bCr?: boolean) {
    // Apply all modifiers: adding attributes, classes, styles, events
    ro= T;
    for (let M of modifs)
        try {
            // See what to do with it
            ApplyMod(elm, M, M.depV.call(elm)    // Evaluate the dependent value in the current environment
                    , bCr);
        }
        catch (e) { throw `[${M.nm}]: ` + e }
    
    ro = F;
}

class RCompiler {

    static iNum=0;
    public num = RCompiler.iNum++;  // Rcompiler instance number, just for identification dureing debugging

    private CT: Context         // Compile-time context

    private cRvars = new Map<string,LVar<RVAR>>(); //RVAR names that were named in a 'reacton' attribute, so they surely don't need auto-subscription

    private doc: Document;
    private head: Node;
    public FilePath: string;
 
    constructor(
        RC?: RCompiler,
        FilePath?: string,
        CT = RC?.CT,
    ) { 
        this.Settings   = RC ? {...RC.Settings} : {...defaults};
        this.FilePath  = FilePath || RC?.FilePath;
        this.doc = RC?.doc || D
        this.head  = RC?.head || this.doc.head;
        this.CT    = new Context(CT, T);
    }
/*
    'Framed' compiles a range of RHTML possibly within a new variable-frame.
    Its parameter 'Comp' is the actual compiling routine, which is executed in a modified context,
    and receives a parameter 'StartScope' that can be used in the builder routine created by 'Comp' to
    convert the environment 'env' into a new frame, and that returns a routine 'EndScope' to restore the precious environment
*/  
    private async Framed<T>(
        Comp: (
            StartScope: (sub: Area, r?:Range) => {sub: Area, ES: () => void }
        )=>Promise<T>
    ): Promise<T> {
        let {CT, rActs} = this
            , {ct,d,L,M} = CT
            , A = rActs.length
            , nf = L - M > 6;    // Is it worthwile to start a new frame? Limit 6 seems more efficient than 0, 4 or 9

        try {
            if (nf) {
                // Modify the 
                CT.ct = `[${ct}]`;
                CT.d++;
                CT.L = CT.M = 0;
            }
            return await Comp(
                // 'StartScope' routine
                (sub, r?) => {
                    if (!r)
                        ({r,sub} = PrepArea(N, sub));
                    let e = env;
                    env = r.val ||= nf ? [e] : ass([], e);
                    return {sub, ES: () => {env = e} }; // 'EndScope' routine
                }
            );
        }
        finally {
            // Restore the context (apart from the maps of visible variables and constructs)
            ass(this.CT, <Context>{ct,d,L,M});
            
            // When new variables or constructs have been set in the maps,
            // 'rActs' contains the restore actions to restore the maps to their previous state
            while (rActs.length > A) 
                rActs.pop()();
        }
    }

    private rActs: Array<() => void> = [];  // Restore actions

    /* Start a new scope, while staying in the same frame.
        Returns a routine 'EndScope' to end the scope.
    */
    private StartScope() {
        // Remember the current context    
        let {CT, CT: {ct, L}, rActs} = this
            , A=rActs.length;

        return () => {  // 'EndScope' routine
            // Restore the previous context string
            CT.ct = ct
            // As the current environment frame contains new variable values that may not be destroyed
            // (because there may be 'Subscriber' updating routines that refer to the frame),
            // we add empty places to the 'ct' string of visible variable names
                    + ','.repeat(CT.L - L);
            // For the same reason, CT.L and CT.M must remain unchanged.

            // When new variables or constructs have been set in the maps of visible variables and constructs,
            // 'rActs' contains the restore actions to restore the maps to their previous state
            while (rActs.length > A)
                rActs.pop()();
        }
    }

    private newV<T>(nm: string): LVar<T> {
        let lv: LVar<T>;
        if (!(nm = nm?.trim()))
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
           lv = dU as LVar<T>;
        else {
            let {CT} = this, L=++CT.L, M = CT.varMap, p = M.get(nm);

            this.rActs.push(() => mapSet(M,nm,p));
            M.set(nm , [CT.d,L]);

            CT.ct = CT.ct.replace(new RegExp(`\\b${nm}\\b`), '') + ',' + nm;

            //(
              lv = (v => (env[L] = v) ) as LVar<T>
            //).i = L;
        }
        lv.nm = nm;
        return lv;        
    }
    private NewVars(varlist: string): Array<LVar> {
        return Array.from(split(varlist), nm => this.newV(nm));
    }

    private NewCons(listS: Iterable<Signature>) {
        let {CT} = this, {csMap, M}= CT;

        for (let S of listS) {
            let p = csMap.get(S.nm);
            this.rActs.push(() => mapSet(csMap,S.nm,p));
            csMap.set(S.nm, [S, [CT.d, --CT.M]]);
        }

        return (CDefs: Iterable<ConstructDef>) => {
            let i = M;
            for (let C of CDefs)
                env[--i] = C;
        }
    }

    // Compile a source tree into an ElmBuilder
    public async Compile(
        elm: ParentNode, 
        settings: Settings = {},
        childnodes?: Iterable<ChildNode>,  // Compile the element itself, or just its childnodes
    ) {
        ass(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
        this.setPRE.add(tag.toUpperCase());
        let t0 = now(),
            bldr = this.Builder = childnodes
            ? await this.CompChilds(elm, childnodes)
            : (await this.CompElm(elm.parentElement, elm as HTMLElement, T))[0]
        this.bCompiled = T;
        this.log(`${this.num} Compiled ${this.srcNodeCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
        return bldr;
    }

    log(msg: string) {
        if (this.Settings.bTiming)
            console.log(new Date().toISOString().substring(11)+' '+msg);
    }

    private setPRE = new Set(['PRE']);

    public async Build(ar: Area) {
        let saveR = R;
        R = this;
        env = NewEnv();
        nodeCnt++;
        await this.Builder?.(ar);
        R = saveR;        
    }

    public Settings: FullSettings;
    private Builder: DOMBuilder;
    public bCompiled: boolean;

    private ws = WSpc.block;  // While compiling: whitespace mode for the node(s) to be compiled; see enum WSpc
    private rspc: booly = T;     // While compiling: may the generated DOM output be right-trimmed
    

    private srcNodeCnt = 0;   // To check for empty Content

    private async CompChilds(
        srcParent: ParentNode,
        childNodes: Iterable<ChildNode> = srcParent.childNodes,
    ): Promise<DOMBuilder> {
        let ES = this.StartScope();
        try {
            return await this.CompIter(srcParent, childNodes);
        }
        finally { ES() }    // End scope
    }

    // Compile some stretch of childnodes
    private async CompIter(srcParent: ParentNode, iter: Iterable<ChildNode>): Promise<DOMBuilder> {
        type Triple = [
            DOMBuilder,         // Builder for a single childnode
            ChildNode,          // The source childnode
            boolean|1    // true: this builder will only produce whitespace and does not modify 'env'
                         // 1: this builder will only produce whitespace
        ];
        let bldrs = [] as Array< Triple >
            , {rspc} = this     // Indicates whether the output may be right-trimmed
            , arr = Array.from(iter)
            , i=0;
        while(rspc && arr.length && reWS.test(arr[arr.length-1].nodeValue)) 
            arr.pop();

        for (let srcNode of arr) {
            this.rspc = ++i==arr.length && rspc;
            let trip: Triple;
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    this.srcNodeCnt ++;
                    trip = await this.CompElm(srcParent, srcNode as HTMLElement);
                    break;

                case Node.TEXT_NODE:
                    this.srcNodeCnt ++;
                    let str = srcNode.nodeValue;
                    
                    let getText = this.CompString( str ), {fixed} = getText;
                    if (fixed !== '') { // Either nonempty or undefined
                        trip = 
                            [ fixed 
                                ? async (ar: Area) => PrepCharData(ar, fixed)
                                : async (ar: Area) => PrepCharData(ar, getText())
                            , srcNode
                            , fixed==' ' ];
                        
                        // Update the compiler whitespace mode
                        if (this.ws < WSpc.preserve)
                            this.ws = / $/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    break;

                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        let getText = this.CompString(srcNode.nodeValue, 'Comment');
                        trip =
                            [ async (ar:Area)=> PrepCharData(ar, getText(), T), srcNode, 1]
                    }
                    break;
            }
                       
            if (trip ? trip[0].ws : this.rspc)
                prune();
            if (trip) 
                bldrs.push(trip);
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

        return setWs(
            async function Iter(ar: Area, start: number = 0)
                // start > 0 is used by auto-generated subscribers
            {                
                let i=0, toSubscribe: Array<[Subscriber, RVAR,number]> = [];
                if (!ar.r) {
                    for (let [bldr] of bldrs) {
                        i++;
                        await bldr(ar);
                        if (bldr.auto) {  // Auto subscribe?
                            let rv = ar.prevR.val as RVAR; // env[bldr.auto.i] as RVAR;
                            toSubscribe.push([
                                Subscriber(ar, Iter, ar.prevR, i)   // Not yet the correct range, we need the next range
                                , rv
                                , rv._Subs.size]); 
                        }
                    }
                    for (let [subs,rv,s] of toSubscribe) {
                        let {sAr} = subs
                            , r = sAr.r ? sAr.r.next : ar.parR.child;
                        if (rv._Subs.size==s && r) // No new subscribers yet?
                        {   // Then auto-subscribe with the correct range
                            (sAr.r = r).updated = updCnt;
                            rv.Subscribe(rv.auto = subs);
                        }
                    }
                } else
                    for (let t of bldrs)
                        if (i++ >= start) 
                            await t[0](ar);
            },
            bldrs[0][0].ws);
    }

    private async CompElm(srcPrnt: ParentNode, srcE: HTMLElement, bUnhide?: boolean
        ): Promise<[DOMBuilder, ChildNode, boolean|1]> {       
        try {
            let 
                tag = srcE.tagName,
                // List of source attributes, to check for unrecognized attributes
                atts =  new Atts(srcE),
                CTL = this.rActs.length,
                // (this)react(s)on handlers
                reacts: Array<{att: string, dRV: Dependent<RVAR[]>}> = [],

                // Generic pseudo-events to be handled BEFORE building
                befor: Array<{att: string, txt: string, hndlr?: Dependent<Handler>, C: boolean, U: boolean, D: boolean}> = [],
                // Generic pseudo-events to be handled AFTER building
                after: Array<{att: string, txt: string, hndlr?: Dependent<Handler>, C: boolean, U: boolean, D: boolean}> = [],
                
                // onerror handler to be installed
                dOnerr: Dependent<Handler> & {bBldr?: boolean},
                // onsuccess handler to be installed
                dOnsuc: Dependent<Handler>,
                
                // The intermediate builder will be put here
                bldr: DOMBuilder,
                // The final builder will be put here
                elmBldr: DOMBuilder,
                
                isBl: boolean|1  // 1 when bldr won't produce output
                , m: RegExpExecArray, nm: string

                // See if this node is a user-defined construct (component or slot) instance
                , constr = this.CT.csMap.get(tag)

                // Check for generic attributes
                , dIf = this.CompAttrExpr(atts, 'if')
                , dH = tag != 'FOR' && this.compAttrExprList<unknown>(atts, 'hash');
            for (let att of atts.keys())
                if (m = genAtts.exec(att))
                    if (m[1])       // (?:this)?reacts?on|on
                        att=='on' && tag!='REACT' || reacts.push({att, dRV: this.compAttrExprList<RVAR>(atts, att, T)});
                    else {
                        let txt = atts.g(att);
                        if (nm = m[3])  // #?(before|after|on)(create|update|destroy)+
                            (m[2] ? befor : after).push({att, txt, C:/c/i.test(nm), U:/u/i.test(nm), D:/y/i.test(nm) });
                        else { // #?on(?:(error)-?|success)
                            let hndlr = this.CompHandlr(att, txt); 
                            if (m[5])   // #?onerror-?
                                ((dOnerr = hndlr) as typeof dOnerr).bBldr = !/-$/.test(att);
                            else dOnsuc = hndlr;
                        }
                    }

            if (bUnhide) atts.set('#hidden', 'false'); 
            if (constr)
                bldr = await this.CompInstance(srcE, atts, constr);
            else {
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE': {
                        NoChildren(srcE);
                        let rv      = atts.g('rvar'), // An RVAR
                            t = '@value', 
                            t_val   = rv && atts.g(t),
                            // When we want a two-way rvar, we need a routine to update the source expression
                            dSet    = t_val && this.CompTarget(t_val,t),
                            dGet    = t_val ? this.CompJScript(t_val,t) : this.CompParam(atts, 'value'),
                            dUpd    = rv && this.CompAttrExpr<RVAR>(atts, 'updates'),
                            dSto    = rv && this.CompAttrExpr<Store>(atts, 'store'),
                            dSNm    = dSto && this.CompParam<string>(atts, 'storename'),
                            bUpd    = atts.gB('reacting') || atts.gB('updating') || t_val,
                            vLet    = this.newV(rv || atts.g('let') || atts.g('var', T)),
                            onMod   = rv && this.CompParam<Handler>(atts, 'onmodified');
                        bldr = async function DEF(ar) {
                            let {bCr, r} = PrepArea(srcE, ar)
                            if (bCr || bUpd || !ar.parR){
                                ro=T;
                                let v = dGet?.();
                                ro=F;
                                if (rv)
                                    if (bCr) {
                                        let upd = dUpd?.();
                                        (vLet as LVar<RVAR>)(r.val =
                                            RVAR(
                                                rv, v, dSto?.(),
                                                dSet?.(), 
                                                dSNm?.()
                                            )
                                        )
                                        .Subscribe(upd?.SetDirty?.bind(upd))
                                        .Subscribe(onMod?.());
                                    } else
                                        (r.val as RVAR).Set(v);
                                else
                                    vLet(v);
                            }
                            else { t=t}
                            //if (onMod && bCr) (r.val as RVAR).Subscribe(onMod());
                        }

                        if (rv && !onMod) {
                            // Check for compile-time subscribers
                            let a = this.cRvars.get(rv);    // Save previous value
                            this.cRvars.set(rv, vLet as LVar<RVAR>);
                            this.rActs.push(() => {
                                // Possibly auto-subscribe when there were no compile-time subscribers
                                if (elmBldr) elmBldr.auto = this.cRvars.get(rv);
                                this.cRvars.set(rv, a);
                            });
                        }
                        
                        isBl = 1;
                    } break;

                    case 'IF':
                    case 'CASE': {
                        let bHiding = atts.gB('hiding'),
                            dVal = this.CompAttrExpr<string>(atts, 'value'),
                            caseNodes: Array<{
                                node: HTMLElement,
                                atts: Atts,
                                body: Iterable<ChildNode>,
                            }> = [],
                            body: ChildNode[] = [],
                            bThen: boolean;
                        
                        for (let node of srcE.childNodes) {
                            if (node instanceof HTMLElement) 
                                switch (node.tagName) {
                                    case 'THEN':
                                        bThen = T;
                                        new Atts(node as HTMLElement).NoneLeft();
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
                            if (srcE.tagName == 'IF')
                                caseNodes.unshift({node: srcE, atts, body});
                            else
                                atts.NoneLeft();

                        let 
                            caseList: Array<{
                                cond?: Dependent<unknown>,
                                not: boolean,
                                patt?: {lvars: LVar[], regex: RegExp, url?: boolean},
                                bldr: DOMBuilder, 
                                node: HTMLElement,
                            }> = [],
                            {ws, rspc, CT}= this,
                            PostCT = CT,
                            postWs: WSpc = 0; // Highest whitespace mode to be reached after any alternative
                        
                        for (let {node, atts, body} of caseNodes) {
                            ass(this, {ws, rspc, CT: new Context(CT)});

                            let ES = this.StartScope();
                            try {
                                let cond: Dependent<unknown>, 
                                    not = T,
                                    patt:  {lvars: LVar[], regex: RegExp, url?: boolean},
                                    p: string;
                                switch (node.tagName) {
                                    case 'IF':
                                    case 'THEN':
                                    case 'WHEN':
                                        cond = this.CompAttrExpr<unknown>(atts, 'cond');
                                        not = !atts.gB('not');
                                        patt =
                                            (p = atts.g('match')) != N
                                                ? this.CompPatt(p)
                                            : (p = atts.g('urlmatch')) != N
                                                ? this.CompPatt(p, T)
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
                                            bldr: await this.CompChilds(node, body),
                                            node
                                        });
                                        atts.NoneLeft();
                                        postWs = Math.max(postWs, this.ws);
                                }
                                PostCT = PostCT.max(this.CT);
                            } 
                            catch (e) { throw node.tagName=='IF' ? e : ErrMsg(node, e); }
                            finally { ES(); }
                        }
                        this.ws = postWs;
                        this.CT = PostCT

                        bldr = 
                            async function CASE(ar: Area) {
                                let value = dVal?.()
                                    , cAlt: typeof caseList[0]      // Choosen alternative
                                    , rRes: RegExpExecArray;
                                for (let alt of caseList)
                                    try {
                                        if ( !(
                                            (!alt.cond || alt.cond()) 
                                            && (!alt.patt || value!=N && (rRes = alt.patt.regex.exec(value)))
                                            ) != alt.not)
                                        { cAlt = alt; break }
                                    } catch (e) { 
                                        if (bHiding)
                                            for (let alt of caseList) PrepElm(alt.node, ar);
                                        else
                                            PrepArea(srcE, ar, '', 1, cAlt);
                                        throw alt.node.tagName=='IF' ? e : ErrMsg(alt.node, e);
                                    }
                                if (bHiding) {
                                    // In this CASE variant, all subtrees are kept in place, some are hidden
                                        
                                    for (let alt of caseList) {
                                        let {r, chAr, bCr} = PrepElm(alt.node, ar);
                                        if ( !(r.node.hidden = alt != cAlt) && !ar.bR
                                             || bCr
                                        )
                                            await R.ErrHandling(alt.bldr, alt.node, chAr );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    let {sub, bCr} = PrepArea(srcE, ar, '', 1, cAlt);
                                    if (cAlt && (bCr || !ar.bR)) {
                                        if (cAlt.patt)
                                            SetLVars(
                                                cAlt.patt.lvars,
                                                cAlt.patt.url ? rRes.map(decodeURIComponent) : rRes
                                            )

                                        await R.ErrHandling(cAlt.bldr, cAlt.node, sub );
                                    }
                                }
                        }
                    } break;
                            
                    case 'FOR':
                        bldr = await this.CompFor(srcE, atts);
                    break;

                    case 'MODULE': // Skip completely!
                        atts.g('id');
                        break;
                        
                    case 'INCLUDE':
                        let src = atts.g('src', T);
                        bldr = await (
                            srcE.children.length || srcE.textContent.trim()
                            ? this.CompChilds(srcE)
                            :  this.Framed(async StartScope => {
                                // Placeholder that will contain a Template when the file has been received
                                let  C: RCompiler = new RCompiler(this, this.GetPath(src))
                                    , task = 
                                        // Parse the contents of the file
                                        // Compile the parsed contents of the file in the original context
                                        C.Compile(N, {bSubfile: T}
                                            , await this.fetchModule(src));
                                return async function INCLUDE(ar) {
                                        let t0 = now();
                                        let bldr = await task;
                                        start += now() - t0;
                                        let {sub,ES} = StartScope(ar);
                                        try { await bldr(sub); }
                                        finally { ES() }
                                    };
                            })
                        );
                    break;

                    case 'IMPORT': {
                        let src = atts.g('src', T)
                            , bIncl = atts.gB('include')
                            , lvars: Array<LVar & {k?: EnvKey}> = this.NewVars(atts.g('defines'))
                            , bAsync = atts.gB('async')
                            , listImps = Array.from(srcE.children).map(ch => this.ParseSign(ch))
                            , DC = this.NewCons(listImps)
                            , promModule = RModules.get(src)   // Check whether module has already been loaded
                            ;
                            
                        if (!promModule) {
                            let C = new RCompiler(this, this.GetPath(src), new Context());
                            C.Settings.bSubfile = T;

                            promModule = this.fetchModule(src).then(async nodes => {
                                let bldr = (await C.CompIter(N, nodes)) || dumB, 
                                    {CT}=C;

                                // Check or register the imported signatures
                                for (let clientSig of listImps) {
                                    let signat = CT.csMap.get(clientSig.nm);
                                    if (!signat)
                                        throw `<${clientSig.nm}> is missing in '${src}'`;
                                    if (bAsync && !clientSig.IsCompat(signat[0]))
                                        throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signat[0].srcElm.outerHTML}`;
                                }
                                for (let v of lvars)
                                    if ((v.k = CT.varMap.get(v.nm)) == N)
                                        throw `Module does not define '${v.nm}'`;
                                        
                                return [bldr, CT];

                            });
                            RModules.set(src, promModule);
                        }
                        if (!bAsync) {
                            let prom = promModule.then(M => {
                                for (let sig of listImps)
                                    ass(sig, M[1].csMap.get(sig.nm)[0]);
                            })
                            for (let sig of listImps)
                                sig.prom = prom;
                        }
                        
                        bldr = async function IMPORT(ar: Area) {
                            let {sub,bCr,r}=PrepArea(srcE, ar)
                            if (bCr || bIncl) {
                                let [bldr, CT] = await promModule
                                    , saveEnv = env
                                    , MEnv = env = r.val ||= NewEnv();
                                await bldr(bIncl ? sub : {parN: D.createDocumentFragment()});
                                env = saveEnv;
                                
                                DC(mapI(listImps, S => getV(CT.d, MEnv, CT.csMap.get(S.nm)[1]) as ConstructDef));
                                    
                                for (let lv of lvars)
                                    lv(getV(CT.d, MEnv,lv.k));
                            }
                        };
                        isBl = 1;

                    } break;

                    case 'REACT': {
                        let ES= this.StartScope(), b: DOMBuilder;
                        try {
                            b = bldr = await this.CompChilds(srcE);
                        }
                        finally { ES() }

                        isBl = b == dumB;
                        if (atts.gB('renew')) {
                            bldr = function renew(sub: Area) {
                                return b(PrepArea(srcE, sub, 'renew', 2).sub);
                            };
                        }
                    } break;

                    case 'RHTML': {
                        NoChildren(srcE);
                        let dSrctext = this.CompParam<string>(atts, 'srctext', T)
                        //  , imports = this.CompAttrExpr(atts, 'imports')
                            , modifs = this.CompAtts(atts);
                        this.ws=WSpc.block;
                        
                        bldr = async function RHTML(ar) {
                            let src = dSrctext()
                            
                                , {r, bCr} = PrepElm(srcE, ar, 'rhtml-rhtml')
                                , {node} = r;
                            ApplyMods(node, modifs, bCr);

                            if (ar.prevR || src != r.res) {
                                r.res = src;
                                let 
                                    svEnv = env,
                                    C = new RCompiler(N, R.FilePath),
                                    sRoot = C.head = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = D.createElement('rhtml'),
                                    sAr = {
                                        parN: sRoot, 
                                        r: N, 
                                        parR: r.child ||= new Range(N, N, 'Shadow')};

                                r.child.erase(sRoot); sRoot.innerHTML='';
                                try {
                                    // Parsing
                                    tempElm.innerHTML = src;
                                    // Compiling
                                    await C.Compile(tempElm, {bSubfile: T, bTiming: R.Settings.bTiming}, tempElm.childNodes);
                                    // Building
                                    await C.Build(sAr);
                                }
                                catch(e) { 
                                    sRoot.appendChild(createErrNode(`Compile error: `+e))
                                }
                                finally { env = svEnv; }
                            }
                        };
                    } break;

                    case 'SCRIPT': 
                        bldr = await this.CompScript(srcPrnt, srcE as HTMLScriptElement, atts); 
                        isBl = 1;
                        break;

                    case 'STYLE':
                        this.head.appendChild(srcE);
                        isBl = 1;
                        break;

                    case 'COMPONENT':
                        bldr = await this.CompComponent(srcE, atts);
                        isBl = 1;
                        break;

                    case 'DOCUMENT': {
                        let vDoc = this.newV(atts.g('name', T)),
                            RC = new RCompiler(this),
                            bEncaps = atts.gB('encapsulate'),
                            vParams = RC.NewVars(atts.g('params')),
                            vWin = RC.newV(atts.g('window')),
                            docBldr = ((RC.head = D.createElement('DocumentFragment')), await RC.CompChilds(srcE));
                        bldr = async function DOCUMENT(ar: Area) {
                            let {r, bCr} = PrepArea(srcE, ar, vDoc.name);
                            if (bCr) {
                                let doc = ar.parN.ownerDocument,
                                    docEnv = env,
                                    wins = r.wins = new Set();
                                r.val = {
                                    async render(w: Window, bCr: boolean, args: unknown[]) {
                                        let svEnv = env, d = w.document;
                                        env = docEnv;
                                        SetLVars(vParams, args);
                                        vWin(w);
                                        try {
                                            if (bCr) {
                                                // Copy all style sheet rules
                                                if (!bEncaps)
                                                    copySSheets(doc, d);
                                                for (let S of RC.head.childNodes)
                                                    d.head.append(S.cloneNode(T));
                                            }
                                            let ar: Area = {parN: d.body, r: (w as any).r};
                                            await docBldr(ar);
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
                            vDoc(r.val);
                        }
                        isBl = 1;
                    } break;

                    case 'RHEAD': {
                        let childBuilder = await this.CompChilds(srcE), {ws} = this;
                        this.ws = this.rspc = WSpc.block;
                        
                        bldr = async function HEAD(ar: Area) {
                            let {sub} = PrepArea(srcE, ar);
                            sub.parN = ar.parN.ownerDocument.head;
                            sub.bfor = N;
                            await childBuilder(sub);
                            if (sub.prevR)
                                sub.prevR.parN = sub.parN;
                        }
                        this.ws = ws;
                        isBl = 1;
                    } break;

                    case 'RSTYLE':
                        let save: [boolean, RegExp, WSpc] = [this.Settings.bDollarRequired, this.rIS, this.ws];

                        this.Settings.bDollarRequired = T; this.rIS = N;
                        this.ws = WSpc.preserve;
                        let childBldr = await this.CompChilds(srcE);

                        [this.Settings.bDollarRequired, this.rIS, this.ws] = save;
                        
                        bldr = function RSTYLE(ar: Area) {
                            return childBldr(PrepElm(srcE, ar, 'STYLE').chAr);
                        };
                        isBl = 1;
                        break;

                    case 'ELEMENT':                        
                        bldr = await this.CompHTMLElm(srcE, atts
                            , this.CompParam(atts, 'tagname', T)
                        );
                        this.ws = WSpc.inline;
                        break;

                    case 'ATTRIBUTE':
                        NoChildren(srcE);
                        let dNm = this.CompParam<string>(atts, 'name', T),
                            dVal= this.CompParam<string>(atts, 'value', T);
                        bldr = async function ATTRIB(ar: Area){
                            let nm = dNm(),
                                {r} = PrepArea(srcE, ar);
                            if (r.val && nm != r.val)
                                (ar.parN as HTMLElement).removeAttribute(r.val);
                            if (r.val = nm)
                                (ar.parN as HTMLElement).setAttribute(nm, dVal());
                        };
                        isBl = 1;
                        break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        bldr = await this.CompHTMLElm(srcE, atts);
                        break;
                }
                atts.NoneLeft();
            }
            
            let {ws} = bldr ||= dumB,
                bba: booly,     // Truthy when there is any before or after event handler
                // Illegal attributes
                ill = this.rActs.length > CTL && (dH && 'hash' || dIf && '#if')
                ;
            if (ill) throw `'${ill}' not possible for declarations`;
            
            if (dOnerr || dOnsuc) {
                let b = bldr;
                bldr = async function SetOnError(ar: Area) {
                    let oo = {onerr, onsuc};
                    try {
                        if (dOnerr) 
                            ((onerr = dOnerr()) as typeof onerr).bBldr = dOnerr.bBldr;
                        if (dOnsuc)
                            onsuc = dOnsuc();
                        await b(ar);
                    }
                    finally { ({onerr,onsuc} = oo); }
                }
            }
            for (let g of conc(befor, after))
                bba = g.hndlr = this.CompHandlr(g.att, g.txt);
            if (bba) {
                let b = bldr;
                bldr = async function ON(ar: Area, x) {
                    let r = ar.r, bfD: Handler;
                    for (let g of befor) {
                        if (g.D && !r)
                            bfD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(
                                r?.node || ar.parN
                            );
                    }
                    await b(ar, x);
                    if (bfD)
                        ar.prevR.bfDest = bfD;
                    for (let g of after) {
                        if (g.D && !r)
                            ar.prevR.onDest = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(
                                (r ? r.node : ar.prevR?.node) || ar.parN
                            );
                    }
                }
                isBl &&= 1;
            }
            if (dH)  {
                let b = bldr;
                bldr = async function HASH(ar: Area) {
                    let {sub, r,bCr} = PrepArea(srcE, ar, 'hash')
                        , hashes = dH();

                    if (bCr || hashes.some((hash, i) => hash !== r.val[i])) {
                        r.val = hashes;
                        await b(sub);
                    }
                }
            }
            if (dIf) {
                let b = bldr;
                bldr = function hif(ar: Area) {
                    let c = dIf(),
                        {sub} = PrepArea(srcE, ar, '#if', 1, !c)
                    if (c)
                        return b(sub)
                }
            }

            for (let {att, dRV} of reacts) {
                let b = bldr,
                    bR = /^this/.test(att);
                bldr = async function REACT(ar: Area) {                
                    let {r, sub, bCr} = PrepArea(srcE, ar, att);
    
                    await b(sub);

                    let rvars = dRV()
                        , subs: Subscriber, pVars: RVAR[]
                        , i = 0;
                    if (bCr)
                        // Create new subscriber
                        subs = r.subs = Subscriber(ass(sub,{bR}), b, r.child);
                    else {
                        // Update the existing subscriber to work with a new environment
                        ({subs, rvars: pVars} = r);
                        if(!subs) return;   // Might happen in case of errors during Create
                    }
                    r.rvars = rvars;
                    r.val = sub.prevR?.val;
                    for (let rvar of rvars) {
                        if (pVars) {
                            let p = pVars[i++];
                            if (rvar==p)
                                continue;
                            p._Subs.delete(subs);
                        }
                        try { rvar.Subscribe(subs); }
                        catch { throw `[${att}] This is not an RVAR`; }
                    }
                }
            }

            return bldr == dumB ? N : [elmBldr = setWs(
                this.rActs.length == CTL
                ? function Elm(ar: Area) {
                    return R.ErrHandling(bldr, srcE, ar);
                }
                : function Elm(ar: Area) {
                    return bldr(ar).catch(e => {throw ErrMsg(srcE, e, 39);})
                }
                , ws), srcE, isBl];
        }
        catch (e) { 
            throw ErrMsg(srcE, e);
        }
    }

    private async ErrHandling(bldr: DOMBuilder, srcNode: ChildNode, ar: Area){
        let {r} = ar;
        if (r?.errN) {
            ar.parN.removeChild(r.errN);
            r.errN = U;
        }
        try {
            await bldr(ar);
        } 
        catch (e) { 
            let msg = 
                srcNode instanceof HTMLElement ? ErrMsg(srcNode, e, 39) : e;

            if (this.Settings.bAbortOnError)
                throw msg;
            console.log(msg);
            if (onerr?.bBldr)
                onerr(e);
            else if (this.Settings.bShowErrors) {
                let errN =
                    ar.parN.insertBefore(createErrNode(msg), ar.r?.FirstOrNext);
                if (r)
                    r.errN = errN;    /*  */
            }
        }
    }

    private async CompScript(_srcParent: ParentNode, srcElm: HTMLScriptElement, atts: Atts) {
        let {type, text, defer, async} = srcElm
            // External source?
            , src = atts.g('src')     // Niet srcElm.src
            // Any variables to define?
            , defs = atts.g('defines')
            , varlist = [...split(defs)]
            // Is this a 'module' script (type=module or e.g. type="otoreact;type=module")?
            , bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type)
            // Is this a classic script?
            , bCls = /^((text|application)\/javascript)?$/i.test(type)
            // Is this an ororeact script (local or static or global)
            , mOto = /^otoreact(\/((local)|static))?\b/.exec(type)
            // True if a local script shpuld be re-executed at every update
            , bUpd = atts.gB('updating')
            // Current context string befóre NewVars
            , {ct} = this.CT
            // Local variables to be defined
            , lvars = mOto && mOto[2] && this.NewVars(defs)
            // Placeholder to remember the variable values when !bUpd
            , exp: Array<unknown>
            // Routine to actually define the either local or global variables
            , SetVars = lvars
                ? (e:unknown[]) => SetLVars(lvars, e)
                : (e:unknown[]) => varlist.forEach((nm,i) => G[nm] = e[i])
            ;
        
        atts.clear();   // No error on unknown attributes

        /* Script have to be handled by Otoreact in the following cases:
            * When it is a 'type=otoreact' script
            * Or when it is a classic or module script ánd we are in a subfile, so the browser doesn't automatically handle it */
        if (mOto || (bCls || bMod) && this.Settings.bSubfile) {
            if (mOto && mOto[3]) {
                // otoreact/local script
                let prom = (async () => gEval(
                        `'use strict';([${ct}])=>{${src ? await this.FetchText(src) : text}\n;return[${defs}]}`
                        ))();
                return async function LSCRIPT(ar: Area) {
                    if (!ar.r || bUpd)
                        SetVars((await prom)(env));
                }
            } 
            else if (bMod) {
                // A Module script, either 'type=module' or type="otoreact...;type=module"
                let prom: Promise<Object> =
                    src 
                    ? import(this.GetURL(src)) // External script
                    : import(
                        // For internal scripts, we must create an "ObjectURL"
                        src = URL.createObjectURL(
                            new Blob(
                                // Imports in the script may need an adjusted URL
                                [ text.replace(
                                    /(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g,
                                    (_, p1, p2, p3) => p1 + this.GetURL(p2) + p3
                                ) ]
                                , {type: 'text/javascript'}
                            )
                        )
                        // And the ObjectURL has to be revoked
                    ).finally(() => URL.revokeObjectURL(src));
                return async function MSCRIPT() {
                    let obj: Object;
                    SetVars(
                        exp ||= 
                            (obj = await prom, 
                                varlist.map(nm => {
                                    if (!(nm in obj))
                                throw `'${nm}' is not exported by this script`;
                                    return obj[nm];
                        })
                            )
                    );
                }
            }
            else {
                // Classic or otoreact/static or otoreact/global script
                let prom = (async() => `${mOto ? "'use strict';":""}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    // Evaluate asynchronously as soon as the script is fetched
                    prom = prom.then(txt => void (exp = gEval(txt)));
                else if (!mOto && !defer)
                    // Evaluate standard classic scripts without defer immediately
                    exp = gEval(await prom);

                return async function SCRIPT() {
                        SetVars(exp ||= gEval(await prom));
                    };
            }
        }
    }

    public async CompFor(this: RCompiler, srcElm: HTMLElement, atts: Atts): Promise<DOMBuilder> {
        let letNm = atts.g('let') ?? atts.g('var')
            , idxNm = atts.g('index');
        if (idxNm == '') idxNm = 'index';
        this.rspc = F;

        if (letNm != N) { /* A regular iteration */
            let getRange =
                this.CompAttrExpr<Iterable<Item> | Promise<Iterable<Item>>>
                (atts, 'of', T
                // Check for being iterable
                , iter => iter && !(Symbol.iterator in iter || Symbol.asyncIterator in iter)
                            && `Value (${iter}) is not iterable`
                )
                , pvNm = atts.g('previous')
                , nxNm = atts.g('next')
                , dUpd = this.CompAttrExpr<RVAR>(atts, 'updates')
                , bReact: booly = atts.gB('reacting') || atts.gB('reactive') || dUpd;

            if (pvNm == '') pvNm = 'previous';
            if (nxNm == '') nxNm = 'next';

            return await this.Framed(async StartScope => {
                
                let             
                // Voeg de loop-variabele toe aan de context
                vLet = this.newV(letNm),
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                vIdx = this.newV(idxNm),
                vPrev = this.newV(pvNm),
                vNext = this.newV(nxNm),

                dKey = this.CompAttrExpr<Key>(atts, 'key'),
                dHash = this.compAttrExprList<Hash>(atts, 'hash'),

                // Compileer alle childNodes
                bodyBldr = await this.CompChilds(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, ar: Area) {
                    let {r, sub} = PrepArea(srcElm, ar, ''),
                        {parN} = sub,
                        bfor = sub.bfor !== U ? sub.bfor : r.Next,
                        iterable: Iterable<Item> | Promise<Iterable<Item>>
                            = getRange() || E
                    
                        , pIter = async (iter: Iterable<Item>) => {
                            // Map of previous data, if any
                            let keyMap: Map<Key, Range> = r.val ||= new Map(),
                            // Map of the newly obtained data
                                nwMap: Map<Key, {item:Item, hash:Hash[], idx: number}> = new Map();

                            let idx=0, {ES} = StartScope(N, <Range>{});
                            try {
                                for await (let item of iter) {
                                    vLet(item);
                                    vIdx(idx);
                                    let hash = dHash?.()
                                        , key = dKey?.() ?? hash?.[0];
                                    if (key != N && nwMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    nwMap.set(key ?? {}, {item, hash, idx: idx++});
                                }
                            }
                            finally { ES() }

                            let nxChR = r.child,
                                iterator = nwMap.entries(),
                                nxIter = nxNm && nwMap.values()

                                , prItem: Item, nxItem: Item
                                , prevR: Range,
                                chAr: Area;
                            sub.parR = r;

                            nxIter?.next();

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
                                let [key, {item, hash, idx}] = nx.value as [Key , {item:Item, hash:Hash[], idx: number}]
                                    , chRng = keyMap.get(key)
                                    , bCr = !chRng;

                                if (nxIter)
                                    nxItem = nxIter.next().value?.item;

                                if (bCr) {
                                    // Item has to be newly created
                                    sub.r = N;
                                    sub.prevR = prevR;
                                    sub.bfor = nxChR?.FirstOrNext || bfor;
                                    ({r: chRng, sub: chAr} = PrepArea(N, sub, `${letNm}(${idx})`));
                                    if (key != N)
                                        keyMap.set(key, chRng);
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

                                    if (prevR) 
                                        prevR.next = chRng;
                                    else
                                        r.child = chRng;
                                    sub.r = chRng;
                                    chAr = PrepArea(N, sub, '').sub;
                                    sub.parR = N;
                                }
                                chRng.prev = prevR;
                                prevR = chRng;

                                if (bCr || !hash
                                    ||  hash.some((h,i) => h != chRng.hash[i])
                                ) {
                                    chRng.hash = hash

                                    // Environment instellen
                                    let {sub, ES} = StartScope(chAr, chRng);
                                    try {
                                        if (bReact && (bCr || item != chRng.rvars[0]))
                                        {
                                            RVAR_Light<Item>(item, dUpd && [dUpd()]);
                                            if (chRng.subs)
                                                (item as RVAR<Item>)._Subs = chRng.rvars[0]._Subs;
                                            chRng.rvars = [item as RVAR];
                                        }
                                        vLet(item);
                                        vIdx(idx);
                                        vPrev(prItem);
                                        vNext(nxItem);

                                        // Body berekenen
                                        await bodyBldr(sub);

                                        if (bReact && !chRng.subs)
                                            (item as RVAR_Light<Item>).Subscribe(
                                                chRng.subs = Subscriber(sub, bodyBldr, chRng.child)
                                            );
                                    }
                                    finally { ES() }
                                }

                                prItem = item;
                            }
                            if (prevR) prevR.next = N; else r.child = N;
                        };

                    if (iterable instanceof Promise) {
                        let subEnv = {env, onerr,  onsuc};
                        r.rvars = [RVAR(N, iterable, N, r.subs = 
                            async iter => {
                                let save = {env, onerr, onsuc};
                                ({env, onerr, onsuc} = subEnv);
                                try { await pIter(iter as Iterable<Item>); }
                                finally {({env, onerr, onsuc} = save)}
                            }
                        )];
                    }
                    else
                        await pIter(iterable);
                };
            });
            }
            else { 
                /* Iterate over multiple slot instances */
                let nm = atts.g('of', T, T).toUpperCase(),
                    {CT} = this, d = CT.d,
                    CSK = CT.csMap.get(nm);

                if (!CSK)
                    // Slot doesn't exist; it's probably a missing 'let'
                    throw `Missing attribute [let]`;

                let ck: EnvKey = CSK[1],
                    vIdx = this.newV(idxNm),
                    DC = this.NewCons([CSK[0]]),
                    bodyBldr = await this.CompChilds(srcElm);
                //srcParent.removeChild(srcElm);

                return async function FOREACH_Slot(this: RCompiler, ar: Area) {
                    let {sub}   = PrepArea(srcElm, ar),
                        slotDef = getV(d, env, ck) as ConstructDef,
                        idx = 0;
                    for (let slotBldr of slotDef.tmplts) {
                        vIdx(idx++);
                        DC([
                            {nm, tmplts: [slotBldr], CEnv: slotDef.CEnv} as ConstructDef
                        ]);
                        await bodyBldr(sub);
                    }
                }
            }
    }

    private ParseSign(elmSignat: Element):  Signature {
        let sig = new Signature(elmSignat);
        for (let attr of elmSignat.attributes) {
            if (sig.RP) 
                throw `Rest parameter must be last`;
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
                sig.Params.push(param);
                if (m[1] == '...')
                    sig.RP = param;
            }
        }
        for (let elmSlot of elmSignat.children) {
            let s = this.ParseSign(elmSlot);
            s.bCln = s.Slots.size;
            mapNm(sig.Slots, s);
            if (/^CONTENT/.test(s.nm)) {
                if (sig.CSlot) throw 'Multiple content slots';
                sig.CSlot = s;
            }
        }
        return sig;
    }

    private async CompComponent(srcElm: HTMLElement, atts: Atts): Promise<DOMBuilder> {

        let bldr: DOMBuilder,
            bRec = atts.gB('recursive'),
            {head, ws} = this
            , signats: Array<Signature> = []
            , tmplts: Array<ConstructDef> = []
            , encStyles = atts.gB('encapsulate')
                && (this.head = srcElm.ownerDocument.createDocumentFragment()).children
            //, DC: (CDefs: Iterable<ConstructDef>) => void
            , arr = Array.from(srcElm.children) as Array<HTMLElement>
                , elmSign = arr.shift()
            , elmTempl = arr.pop()
            , t = /^TEMPLATE(S)?$/.exec(elmTempl?.tagName);

            if (!elmSign) throw 'Missing signature(s)';
        if (!t) throw 'Missing template(s)';

        for (let elm of /^SIGNATURES?$/.test(elmSign.tagName) ? elmSign.children : [elmSign])
            signats.push(this.ParseSign(elm));

        let DC = bRec && this.NewCons(signats)
            , ES = this.StartScope();
        try {
            bldr = await this.CompIter(srcElm, arr);
            
            let mapS = new Map<string, Signature>(mapI(signats, S => [S.nm, S]));
            async function AddTemp(RC: RCompiler, nm: string, prnt: ParentNode, elm: HTMLElement) {
                let S = mapS.get(nm);
                if (!S) throw `<${nm}> has no signature`;
                tmplts.push({
                    nm,
                    tmplts: [ await RC.CompTempl(S, prnt, elm, F, encStyles) ]
                });
                mapS.delete(nm);
            }
            if (t[1]) // <TEMPLATES> ?
                // Each child is a template
                for (let elm of elmTempl.children as Iterable<HTMLElement>)
                    await AddTemp(this, elm.tagName, elm, elm);
            else
                // All content forms one template
                await AddTemp(this, signats[0].nm, (elmTempl as HTMLTemplateElement).content, elmTempl);
            for (let nm of mapS.keys())
                throw `Signature <${nm}> has no template`;
        }
        finally { 
            ES();
            ass(this.head, {head, ws}); 
        }

        DC ||= this.NewCons(signats);

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return async function COMPONENT(ar: Area) {
            let constr: ConstructDef[] = tmplts.map(C => ({...C}));  // C must be cloned, as it will receive its own environment
            if (bRec)
                DC(constr);

            bldr && await R.ErrHandling(bldr, srcElm, ar);

            // At runtime, we just have to remember the environment that matches the context
            // And keep the previous remembered environment, in case of recursive constructs
            for(let c of constr)
                c.CEnv = env;

            if (!bRec)
                DC(constr);
        };
    }

    private async CompTempl(signat: Signature, contentNode: ParentNode, srcElm: HTMLElement, 
        bIsSlot?: boolean, encStyles?: Iterable<Node>, atts?: Atts
    ): Promise<Template>
    {
        return this.Framed(async StartScope => {
            try {
                let
                    myAtts = atts || new Atts(srcElm),
                    // Local variables to contain the attribute values.
                    // Note that the attribute name 'nm' may be different from the variable name.
                    lvars: Array<[string, LVar]> =
                        signat.Params.map(
                            ({mode,nm}) => [nm, this.newV((myAtts.g(mode + nm) ?? myAtts.g(nm, bIsSlot)) || nm)]
                        ),
                    DC = this.NewCons(signat.Slots.values());

                if (!atts)
                    myAtts.NoneLeft();
                this.ws = this.rspc = WSpc.block;
                let
                    bldr = await this.CompChilds(contentNode),
                    Cnm = signat.nm,
                    custNm = /^[A-Z].*-/.test(Cnm) ? Cnm : `rhtml-${Cnm}`;

                // Routine to instantiate the template
                return async function TEMPLATE(
                    args: unknown[]                   // Arguments to the template
                    , mSlots: Map<string, Template[]>   // Map of slot templates
                    , CEnv: Environment                 // Environment to be used for the slot templates
                    , ar: Area
                ) {
                    let {sub, ES} = StartScope(ar);
                    try {
                        // Set parameter values, with default when undefined
                        lvars.forEach(([nm,lv], i) => {
                            let arg = args[nm];
                            lv(arg !== U ? arg : signat.Params[i]?.pDflt?.());
                        })
                        // Define all slot-constructs
                        DC(mapI(signat.Slots.keys(), nm => ({nm, tmplts: mSlots.get(nm) || E, CEnv, Cnm})));

                        if (encStyles) {
                            let {r: {node}, chAr, bCr} = PrepElm(srcElm, sub, custNm), 
                                shadow = node.shadowRoot || node.attachShadow({mode: 'open'});
                            if (bCr)
                                for (let style of encStyles)
                                    shadow.appendChild(style.cloneNode(T));
                            
                            if (signat.RP)
                                ApplyMod(node, {mt: MType.RestArgument, nm: N, depV: N}, args[signat.RP.nm], bCr);
                            chAr.parN = shadow;
                            sub = chAr;
                        }
                        await bldr?.(sub);
                    }
                    finally { ES() }
                }
            }
            catch (e) { throw ErrMsg(srcElm, 'template: '+e); }
        });
    }


    private async CompInstance(
        srcElm: HTMLElement, atts: Atts,
        [signat,ck]: [Signature, EnvKey]
    ) {
        if (signat.prom)
            await signat.prom;
        let 
            d = this.CT.d,
            {RP, CSlot} = signat,
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
                        , this.CompTarget(attVal,nm)
                        //, this.CompJScript<Handler>(`$=>{${attVal}=$}`, nm)
                    ]
                    : [nm, U, dU]
                )
            }
            else if (mode != '...') {
                let dH = this.CompParam(atts, nm, !pDflt);
                if (dH) getArgs.push([nm, dH]);
            }

        let slotElm: HTMLElement, slot: Signature, nm: string;
        for (let node of Array.from(srcElm.children))
            if ((slot = signat.Slots.get(nm = (slotElm = (node as HTMLElement)).tagName))
                && slot != CSlot
                ) {
                SBldrs.get(nm).push(
                    await this.CompTempl(slot, slotElm, slotElm, T)
                );
                srcElm.removeChild(node);
            }
            
        if (CSlot)
            SBldrs.get(CSlot.nm).push(
                await this.CompTempl(CSlot, srcElm, srcElm, T, N, atts)
            );

        if (RP) {
            let modifs = this.CompAtts(atts);
            getArgs.push([
                RP.nm, 
                () => modifs.map(M => ({M, v: M.depV()})) as RestParameter
            ]);
        }
        
        atts.NoneLeft();
        this.ws = WSpc.inline;

        return async function INSTANCE(this: RCompiler, ar: Area) {
            let {r, sub, bCr} = PrepArea(srcElm, ar),
                cdef = getV(d, env, ck) as ConstructDef,
                IEnv = env,
                args = r.res ||= {};
            //if (cdef?.nm != srcElm.tagName) debugger;
            if (!cdef) return;  //Just in case of an async imported component where the client signature has less slots than the real signature
            ro = T;
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bCr)
                    args[nm] = RVAR('', dGet?.(), N, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            
            ro = F;
            try {
                env = cdef.CEnv;
                for (let templ of cdef.tmplts) 
                    await templ(args, SBldrs, IEnv, sub);
            }
            finally {env = IEnv;}
        }
    }

    private async CompHTMLElm(srcElm: HTMLElement, atts: Atts,
            dTag?: Dependent<string>
        ) {
        // Remove trailing dots
        let nm = dTag ? N : srcElm.tagName.replace(/\.+$/, ''),
            // Remember preceeding whitespace-mode
            preWs = this.ws
            // Whitespace-mode after this element
            , postWs: WSpc;

        if (this.setPRE.has(nm)) {
            this.ws = WSpc.preserve; postWs = WSpc.block;
        }
        else if (reBlock.test(nm))
            this.ws = this.rspc = postWs = WSpc.block;
        
        else if (reInline.test(nm)) {  // Inline-block
            this.ws = this.rspc = WSpc.block;
            postWs = WSpc.inline;
        }
        
        if (preWs == WSpc.preserve)
            postWs = preWs;

        // We turn each given attribute into a modifier on created elements
        let modifs = this.CompAtts(atts)

        // Compile the given childnodes into a routine that builds the actual childnodes
            , childBldr = await this.CompChilds(srcElm);

        if (postWs)
            this.ws = postWs;

        // Now the runtime action
        return setWs(
            async function ELM(ar: Area) {
                let {r: {node}, chAr, bCr} = PrepElm(srcElm, ar, nm || dTag());
                
                if (bCr || !ar.bR)
                    // Build children
                    await childBldr?.(chAr);

                node.removeAttribute('class');
                if (node.hndlrs) {
                    for (let {evType, listener} of node.hndlrs)
                        node.removeEventListener(evType, listener);
                    node.hndlrs = [];
                }
                ApplyMods(node, modifs, bCr);
            }
            , postWs == WSpc.block || preWs < WSpc.preserve && childBldr?.ws
                        // true when whitespace befóre this element may be removed
        );
    }

    private CompAtts(atts: Atts) { 
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
                        this.AddErrH(this.CompHandlr(nm, V))
                    );
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    addM(MType.Class, m[1],
                        this.CompJScript<boolean>(V, nm)
                    );
                else if (m = /^(#)?style\.(.*)$/.exec(nm))
                    addM(MType.Style, CapProp(m[2]),
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
                    
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript<Handler>(V, nm);
                        if (/^on/.test(nm))
                            addM(MType.Event, nm, this.AddErrH(depV as Dependent<Handler>));
                        else
                            addM(MType.Prop, nm, depV);
                    }

                    if (m[1] != '#') {
                        let dS = this.CompTarget(V), 
                            cnm: string;
                        setter = () => {
                            let S = dS();
                            return function(this: HTMLElement) {
                                S(this[cnm ||= ChkNm(this, nm)])
                            }
                        }
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

    private rIS: RegExp;
    private CompString(data: string, nm?: string): Dependent<string> & {fixed?: string} {
        let 
            // Regular expression to recognize string interpolations, with or without dollar,
            // with support for two levels of nested braces,
            // were we also must take care to skip js strings possibly containing braces and escaped quotes.
            // Backquoted js strings containing js expressions containing backquoted strings might go wrong
            // (We can't use negative lookbehinds; Safari does not support them)
            rIS = this.rIS ||= 
                new RegExp(
                    /(\\[${])|/.source
                    + (this.Settings.bDollarRequired ? /\$/ : /\$?/).source
                    + /\{((\{(\{.*?\}|.)*?\}|'(\\'|.)*?'|"(\\"|.)*?"|`(\\`|.)*?`|\\\}|.)*?)\}|$/.source
                    , 'gs'
                ),
            gens: Array< string | Dependent<unknown> > = [],
            ws: WSpc = nm || this.Settings.bKeepWhiteSpace ? WSpc.preserve : this.ws
            , isTriv = T, bThis: boolean
            , lastIndex = rIS.lastIndex = 0
            , dep: Dependent<string> & {fixed?: string}
            , m: RegExpExecArray;

        while (T)
            if (!(m = rIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.slice(lastIndex, m.index) : N;
                if (fixed) {
                    fixed = fixed.replace(/\\([${}\\])/g, '$1'); // Replace '\{' etc by '{'
                    if (ws < WSpc.preserve) {
                        fixed = fixed.replace(/[ \t\n\r]+/g, ' ');  // Reduce whitespace
                        // We can't use \s for whitespace, because that includes nonbreakable space &nbsp;
                        if (ws <= WSpc.inlineSpc && !gens.length)
                            fixed = fixed.replace(/^ /,'');     // No initial whitespace
                        if (this.rspc && !m[2] && rIS.lastIndex == data.length)
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
                }
                lastIndex = rIS.lastIndex;
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
        return dep;
    }

    // Compile a 'regular pattern' into a RegExp and a list of bound LVars
    private CompPatt(patt:string, url?: boolean): {lvars: LVar[], regex: RegExp, url: boolean}
    {
        let reg = '', lvars: LVar[] = []
        
        // These are the subpatterns that are need converting; all remaining characters are literals and will be quoted when needed
        , regIS =
            /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;

        while (regIS.lastIndex < patt.length) {
            let ix = regIS.lastIndex
                , m = regIS.exec(patt)
                , literals = patt.slice(ix, m.index);

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
            : /^on/.test(attName) ? this.CompHandlr(attName, v) as Dependent<any>
            : this.CompString(v, attName) as Dependent<any>
        );
    }
    private CompAttrExpr<T>(atts: Atts, att: string, bReq?: booly
        , check?: (t:T) => string   // Additional check
        ) {
        return this.CompJScript<T>(atts.g(att, bReq, T),att, U, check);
    }

    private CompTarget<T = unknown>(expr: string, nm?:string): Dependent<(t:T) => void>
    // Compiles an "assignment target" (or "LHS expression") into a routine that sets the value of this target
    {            
        try {
            return this.CompJScript<(t:T) => void>(`$=>(${expr})=$`, nm);
        }
        catch (e) { throw `Invalid left-hand side ` + e; }
    }

    private CompHandlr(nm: string, text: string): Dependent<Handler> {
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

        try {
            let rout = gEval(
                `'use strict';(function expr([${this.CT.ct}]){return(${expr}\n)})`
            ) as (env:Environment) => T;
            return function(this: HTMLElement) {
                            try { 
                                let t = rout.call(this, env),
                                    m = check?.(t); 
                                if (m) throw m;
                                return t;
                            } 
                            catch (e) {throw `${descrip?`[${descrip}] `:''}${delims[0]}${Abbr(expr)}${delims[1]}: `+e }
                        };
        }
        catch (e) { throw `${descrip?`[${descrip}] `:''}${delims[0]}${Abbr(expr)}${delims[1]}: `+e }             
        // Compiletime error
    }
    private CompName(nm: string): Dependent<unknown> {
        let k = this.CT.varMap.get(nm), d = this.CT.d;
        if (!k) throw `Unknown name '${nm}'`;
        return () => getV(d, env, k);
    }
    private compAttrExprList<T>(atts: Atts, attName: string, bReacts?: boolean): Dependent<T[]> {
        let list = atts.g(attName, F, T);
        if (list==N) return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars.set(nm, N);
        return this.CompJScript<T[]>(`[${list}\n]`, attName);
    }

    private AddErrH(getHndlr: Dependent<Handler>): Dependent<Handler> {
        return () => {
            let hndlr = getHndlr()
                , oE = onerr, oS = onsuc;
            return (hndlr && (oE||oS)
                ? function hError(this: HTMLElement, ev: Event) {
                    try {
                        let a = hndlr.call(this,ev);
                        if (a instanceof Promise)
                            return a.then(oS && (v => (oS(ev),v)), oE);
                        oS?.(ev);
                        return a;
                    }
                    catch (e) {
                        if (!oE) throw e;
                        oE(e);
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
                return conc(d.head.childNodes, b.childNodes);

            m = e;
        }
        else if (m.tagName != 'MODULE')
            throw `#${src} must be a <MODULE>`;
        return m.childNodes;
    }
}

export async function RFetch(input: RequestInfo, init?: RequestInit) {
    let rp = await fetch(input, init);
    if (!rp.ok)
        throw `${init?.method||'GET'} ${input} returned ${rp.status} ${rp.statusText}`;
    return rp;
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
            if (!/^_/.test(a.name)) // Ignore attributes starting with '_'
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
    public NoneLeft() {
        super.delete('hidden'); // Hidden may be added to any construct, so it remains hidden until compiled
        if (super.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}

let 
    R = new RCompiler(),
    // Property names to be replaced
    altProps = {
        "class": "className", 
        for: "htmlFor"
    }
    // Global attributes and pseudo-events
    , genAtts = /^#?(?:((?:this)?reacts?on|on)|(?:(before)|on|after)((?:create|update|destroy)+)|on((error)-?|success))$/
    // Valid identifiers
    , reIdent = /^[A-Z_$][A-Z0-9_$]*$/i
    // Reserved words
    , reReserv = /^(break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/

// Capitalization of (just) style property names.
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
// Better not use lookbehind assertions (https://caniuse.com/js-regexp-lookbehind):
    , reCap = /(accent|additive|align|angle|animation|ascent|aspect|auto|back(drop|face|ground)|backface|behavior|blend|block|border|bottom|box|break|caption|caret|character|clip|color|column(s$)?|combine|conic|content|counter|css|decoration|display|emphasis|empty|end|feature|fill|filter|flex|font|forced|frequency|gap|grid|hanging|hue|hyphenate|image|initial|inline|inset|iteration|justify|language|left|letter|line(ar)?|list|margin|mask|masonry|math|max|min|nav|object|optical|outline|overflow|padding|page|paint|perspective|place|play|pointer|rotate|position|print|radial|read|repeating|right|row(s$)?|ruby|rule|scale|scroll(bar)?|shape|size|snap|skew|skip|speak|start|style|tab(le)?|template|text|timing|top|touch|transform|transition|translate|underline|unicode|user|variant|variation|vertical|viewport|white|will|word|writing|^z)|./g

    // Elements that trigger block mode; whitespace before/after is irrelevant
    , reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL|SELECT|TITLE)$/
    , reInline = /^(BUTTON|INPUT|IMG)$/     // Elements that trigger inline mode
    , reWS = /^[ \t\n\r]*$/                 // Just whitespace, non-breaking space U+00A0 excluded!

    // Capitalized propnames cache
    , Cnms: {[nm: string]: string} = {};

function ChkId(nm: string) {
    // Check valid JavaScript identifier
    if (!reIdent.test(nm)) throw `Invalid identifier '${nm}'`;
    if (reReserv.test(nm)) throw `Reserved keyword '${nm}'`;
    return nm;
}
// Properly capitalize a Style property
function CapProp(nm: string) {
    let b: boolean;
    return nm.replace(reCap, (w, w1) => {
        let r = b ? w.slice(0,1).toUpperCase() + w.slice(1) : w;
        b = w1;
        return r;
    });
}

// Check whether object obj has a property named like attribute name nm, case insensitive,
// and returns the properly cased name; otherwise return nm.
// Results are cached in 'Cnms', regardless of 'obj'.
function ChkNm(obj: object, nm: string): string {
    if (Cnms[nm]) return Cnms[nm];  // If checked before, return the previous result
    let c=nm,
        r = new RegExp(`^${nm}$`, 'i'); // (nm cannot contain special characters)
    if (!(nm in obj))
        for (let p in obj)
            if (r.test(p))
                {c = p; break;}
    return Cnms[nm] = c;
}

function ErrMsg(elm: HTMLElement, e: string, maxL?: number): string {
    return Abbr(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxL) + '> ' + e;
}
function Abbr(s: string, m: number=60) {
    return s.length > m ?
        s.slice(0, m - 3) + "..."
        : s;
}
function LAbbr(s: string, m: number = 1000) {
    return s.length > m ?
        "... " + s.slice(s.length - m + 4)
        : s;
}

function mapNm<V extends {nm: string}>(m: Map<string, V>, v:V) {
    m.set(v.nm, v);
}
function mapSet<V>(m: Map<string, V>, nm: string, v:V) {
    if (v!=N)
        m.set(nm, v);
    else
        m.delete(nm);
}

function* conc<T>(R: Iterable<T>, S:Iterable<T>)  {
    for (let x of R) yield x;
    for (let x of S) yield x;
}
function* mapI<A, B>(I: Iterable<A>, f: (a:A)=>B): Iterable<B> {
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

function setWs(t:DOMBuilder, v: boolean): DOMBuilder {
    t.ws = v;
    return t;
}

function createErrNode(msg: string) {
    let e = D.createElement('div');
    ass(e.style, {color: 'crimson', fontFamily: 'sans-serif', fontSize: '10pt'});
    e.innerText = msg;
    return e;
}
function NoChildren(srcElm: HTMLElement) {
    for (let node of srcElm.childNodes)
    if (srcElm.childElementCount
        || node.nodeType==Node.TEXT_NODE && !reWS.test(node.nodeValue)
        )
        throw `<${srcElm.tagName} ...> must be followed by </${srcElm.tagName}>`;
}

function copySSheets(S: Document, D: Document) {
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

class DocLoc extends _RVAR<string> {
        constructor() {
            super('docLocation', L.href);
            W.addEventListener('popstate', _ => this.V = L.href );

            let DL = this;
            this.query = new Proxy({}, {
               get( _, key: string) { return DL.url.searchParams.get(key); },
               set( _, key: string, val: string) { DL.V = DL.search(key, val); return true}
           });

            this.Subscribe(loc => {
                let h = (this.url = new URL(loc)).href;
                h == L.href || history.pushState(N, N, h);    // Change URL withour reloading the page
                    ScrollToHash();
            },T,T);
        }
        basepath: string;
        url: URL;
        get subpath() {return L.pathname.slice(this.basepath.length); }
        set subpath(s) {
            this.url.pathname = this.basepath + s;
            this.V = this.url.href;
        }
        query: {[fld: string]: string};
        search(fld: string, val: string) {
            let U = new URL(this.V);
            mapSet(U.searchParams as any, fld, val);
            return U.href;
        }
        RVAR(fld: string, df?: string, nm: string = fld) {
            let R = RVAR<string>(nm, N, N, v => this.query[fld] = v);
            this.Subscribe(_ => R.V = this.query[fld] ?? df, T);
            return R;
        }
    }
const DL = new DocLoc(),
    reroute: (arg: MouseEvent | string) => void = 
        arg => {
            if (typeof arg == 'object') {
                if (arg.ctrlKey)
                    return;
                arg.preventDefault();
                arg = (arg.target as HTMLAnchorElement).href;
            }
            DL.V = new URL(arg, DL.V).href;
        };
export {DL as docLocation, reroute}

function ScrollToHash() {
    if (L.hash)
        setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6);
}
    
ass(
    G, {RVAR, range, reroute, RFetch}
);

if (/^rhtml$/i.test(D.body.getAttribute('type')))
    setTimeout(RCompile, 0);