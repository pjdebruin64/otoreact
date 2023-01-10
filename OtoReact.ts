/* The OtoReact framework
* Copyright 2022 Peter J. de Bruin (peter@peterdebruin.net)
* See https://otoreact.dev/
*/
const
    // Some abbreviations
    // Please forgive me for trying to minimize the library file size
    U = undefined, N = null, T = true, F = false, 
    E = [],     // Empty array, must remain empty
    W = window, D = document, L = location,
    G = self,
        // Polyfill for globalThis
        //W.globalThis || ((W as any).globalThis = W.self)
    US = "'use strict';",

    // Global settings 
    defaults = {
        bTiming:        F,
        bAbortOnError:  F,      // Abort processing on runtime errors,
                                // When false, only the element producing the error will be skipped
        bShowErrors:    T,      // Show runtime errors as text in the DOM output
        bSubfile:    F,
        basePattern:    '/',
        preformatted:   E as string[],
        bAuto:          T,
        bNoGlobals:     F,
        bDollarRequired: F,
        bSetPointer:    T,
        bKeepWhiteSpace: F,
        bKeepComments:  F,
        storePrefix:    "RVAR_",
        version:        0
    },
    
    // Some utilities
    P = new DOMParser(),
    Ev = eval,                  // Note: 'eval(txt)' can access variables from this file, while 'Ev(txt)' cannot.
    ass = Object.assign as
                <T extends Object>(obj: T, props: Object) => T,
    now = () => performance.now(),
    thro = (err: any) => {throw err}
    ;

// Type used for truthy / falsy values
type booly = boolean|string|number|object;

type FullSettings = typeof defaults;
type Settings = Partial<FullSettings>;

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

/* A 'DOMBuilder' is the semantics of a piece of RHTML.
    It can both build (construct, create) a new range of DOM within an Area, and update an earlier created range of DOM within that same Area.
    The created DOM is yielded in 'ar.r'.
    're' is 1 when the DOMBuilder is called on behalf of a 'reacton' attribute on the current source node,
    2 when on behalf of a 'thisreactson' attribute.
*/
type DOMBuilder = ((ar: Area, re?: number) => Promise<void>) 
    & {
        auto?: string; // When defined, the DOMBuilder will create an RVAR that MIGHT need auto-subscribing.
        nm?: string;   // Name of the DOMBuilder
    };


/* An 'Area' is a (runtime) place to build or update a piece of DOM, with all required information a builder needs.
    Area's are transitory objects; discarded after the builders are finished
*/
type Area<VT = unknown> = {
    r?: Range<ChildNode, VT> | true,          // Existing piece of DOM
    // When falsy (undefined or null), the DOM has to be CREATED
    // When truthy (defined or true), the DOM has to be UPDATED

    parN: Node;            // DOM parent node
    bfor?: ChildNode;     // DOM node before which new nodes are to be inserted

    /* When !r, i.e. when the DOM has to be created: */
    srcN?: HTMLElement;     // Optional source node to be replaced by the new DOM 
    parR?: Range;         // The new range shall either be the first child this parent range,
    prvR?: Range;        // Or the next sibling of this previous range

    /* When r, i.e. when the DOM has to be updated: */
    bR?: boolean,         // true == update root node only, not its children
                          // Set by 'thisreactson'.
}
/* An 'AreaR' is an Area 'ar' where 'ar.r' is a 'Range' or 'null', not just 'true' */

type AreaR<VT = unknown> = Area<VT> & {r?: Range<ChildNode, VT>};

/* A RANGE object describe a (possibly empty) range of constructed DOM nodes, in relation to the source RHTML.
    It can either be a single DOM node, with child nodes described by a linked list of child-ranges,
    OR just a linked list of subranges.
    It is created by a builder, and contains all metadata needed for updating or destroying the DOM.
*/
class Range<NodeType extends ChildNode = ChildNode, VT = unknown> {
    node: NodeType;     // Optional DOM node, in case this range corresponds to a single node
    
    ch: Range;         // Linked list of child ranges (null=empty)
    nx: Range;         // Next range in linked list

    parR?: Range;       // Parent range, only when both belong to the SAME DOM node
    parN?: Node;        // Parent node, only when this range has a DIFFERENT parent node than its parent range

    constructor(
        ar: Area,               // The constructor puts the new Range into this Area
        node?: NodeType,        // Optional DOM node
        public text?: string,   // Description, used only for comments
    ) {
        this.node = node;
        if (ar) {
            let {parR: p, prvR: q} = ar;
            if (p && !p.node)
                // Set the parent range, only when that range isn't a DOM node
                this.parR = p;
            
            // Insert this range in a linked list, as indicated by 'ar'
            if (q) 
                q.nx = this;
            else if (p)
                p.ch = this;
        
            // Update the area, so the new range becomes its previous range
            ar.prvR = this;
        }
    }

    toString() { return this.text || this.node?.nodeName; }

    // Get first childnode IN the range
    public get Fst(): ChildNode {
        let {node: f, ch: c} = <Range>this;
        while (!f && c) {
            f = c.Fst;
            c = c.nx;
        }
        return f;
    }
    
    // Get first node with the same parent node AFTER the range
    public get Nxt(): ChildNode {
        let
            r = <Range>this,
            n: ChildNode,
            p: Range;
        do {
            p = r.parR;
            while (r = r.nx)
                if (n = r.Fst) return n;
        } while (r = p)
    }

    public get FstOrNxt() {
        return this.Fst || this.Nxt;
    }

    // Enumerate all DOM nodes within this range, not including their children
    Nodes(): Generator<ChildNode> { 
        // 'Nodes' is a recursive enumerator, that we apply to 'this'
        return (function* Nodes(r: Range) {
            let c: Range;
            if (r.node)
                yield r.node;
            else if (c = r.ch)
                do {
                    yield* Nodes(c);
                } while (c = c.nx)
        })(this)
    }

    // The following properties may contain different types of meta-information about the created DOM, to be used by the builder.

    res?: any;  // Some result value to be kept by a builder
    val?: VT;  // Some other value to be kept by a builder

    errN?: ChildNode;  // When an error description node has been inserted, it is saved here, so it can be removed on the next update

    bfD?: Handler;   // Before destroy handler
    afD?: Handler;   // After destroy handler

    // For reactive elements
    upd?: number;       // last DoUpdate iteration number, so the range is not updated again in the same iteration
    subs?: Subscriber;      // Subscriber object created for this element instance
    rvars?: RVAR[];         // RVARs on which the element reacts


    // Erase the range, i.e., destroy all child ranges and remove all nodes.
    // The range itself remains a child of its parent.
    erase(par: Node) {
        let {node, ch: c} = this;
        if (node && par) {
            // Remove the current node, only when 'par' is specified
            par.removeChild(node);
            par = N; // No need to remove child nodes of this node
        }
        this.ch = N;
        while (c) {
            if (c.bfD) // Call a 'beforedestroy' handler
                c.bfD.call(c.node || par);

            // Remove range ch from any RVAR it is subscribed to
            c.rvars?.forEach(rv =>
                rv._Subs.delete(c.subs));

            // Destroy 'c'
            c.erase(c.parN || par);

            if (c.afD)  // Call 'afterdestroy' handler
                c.afD.call(c.node || par);

            c = c.nx;
        }
    }
}

// An ENVIRONMENT holds at runtime the actual values of all local variables (lvars) and construct definitions.
// It is organized as a linked list of frames, where each frame is an array of values,
// and its first element is the parent frame.
// Local variables in nested scopes will in most cases be stored in the same frame;
// they will just be made invisible after the scope has ended.

// Furthermore, because construct definitions can vary and can contain references to local variables outside the definition,
// they must be stored in the environment as well.
// We use negative indices for this, like { [k: number]: ConstructDef} for k<0
type Environment =  [Environment?, ...unknown[] ];

// An Environment Key points to a value in an environment. It consists of a frame number and an array index.
type EnvKey = [number, number];

// A CONTEXT keeps track at runtime of all visible local variables and constructs, and were thet are s
class Context {
    d: number;          // Depth = number of parent frames
    L: number;          // Length = number of positive (local variable) array elements
    M: number;          // Number of negative (construct) array elements
    ct: string;         // String of all visible variable names, to match against an environment

    // Mapping of visible lvar names to EnvKeys
    lvMap: Map<string, EnvKey>
    // Mapping of visible construct names to their signature and EnvKey
    csMap:  Map<string, {S:Signat, k: EnvKey}>;

    // Construct a new context, optionally based on an existing context.
    // When 'a' is truthy, the context is to be used for asynchronous compilation and a copy of the map is to be made.
    // With synchronous compilation, this is not needed because the maps will always be restored to their previous value.
    constructor(C?: Context, a?: booly) {
        ass(
            this,
            C || {
                d: 0, L: 0, M: 0, ct: '',
                lvMap: new Map(), csMap: new Map()
            }
        );
        if (a && C) {
            this.lvMap = new Map(this.lvMap);
            this.csMap = new Map(this.csMap);
        }
    }

    // Return a routines that, given an environment matching the current context returns the value pointed to by 'k'
    getV<T>(k: EnvKey): DepE<T> {
        if (k) {
            let d = this.d;
            return (e:Environment = env) => {
                let [F,i] = k;
                for(;F < d; F++)
                    e = e[0];
                return e[i] as T;
            }
        }
    }
    // For a variable name 'nm', returns a routines that,
    // given an environment matching the current context returns the lvar named by 'nm'
    // Throws an error when unknown
    getLV(nm: string): DepE<unknown>
    {
        return this.getV(this.lvMap.get(nm) || thro(`Unknown name '${nm}'`));
    }
    // For a construct name 'nm', return a routines that,
    // given an environment matching the current context,
    // returns both the signature and the ConstructDef named by 'nm'
    // Returns 'null' when unknown
    getCS(nm: string): {S: Signat, dC: DepE<ConstructDef>}
    {
        let SK = this.csMap.get(nm);
        return SK && {S: SK.S, dC: this.getV<ConstructDef>(SK.k)};
    }
    
    // Used by the <CASE> construct, that has alternative scopes all stored in the same frame.
    max(C: Context) {
        return ass(
            //C,
            C.L > this.L ? C : this, 
            {
                //L: Math.max(this.L, C.L),
                M: Math.min(this.M, C.M)
            }
        );
    }
}

export async function RCompile(srcN: hHTMLElement = D.body, settings?: Settings): Promise<void> {
    if (srcN.isConnected && !srcN.hndlrs)   // No duplicate compilation
        try {
            srcN.hndlrs = [];
            let {basePattern} = R.Settings = {...defaults, ...settings},
                m = L.href.match(`^.*(${basePattern})`);
            R.FilePath = L.origin + (
                DL.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : ''
            )
            await R.Compile(srcN);

            // Initial build
            start = now();
            nodeCnt = 0;
            srcN.innerHTML = "";
            await R.Build({
                parN: srcN.parentElement,
                srcN,           // When srcN is a non-RHTML node (like <BODY>), then it will remain and will receive childnodes and attributes
                bfor: srcN      // When it is an RHTML-construct, then new content will be inserted before it
            });
            W.addEventListener('pagehide', () => chiWins.forEach(w=>w.close()));
            R.log(`Built ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
            ScrollToHash();
        }
        catch (e) {    
            alert(`OtoReact compile error: ` + Abbr(e, 1000));
        }
}

// A  DEPENDENT value of type T in a given context is a routine computing a T, using the current global environment 'env' that should match that context
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dep<T> = (() => T);
// 'DepE<T>' is the same thing, using an optional parameter. The default parameter value should be the global environment, again.
type DepE<T> = ((e?:Environment) => T);

/* The following function prepares a sub area of a given 'area', 
    containing (when creating) a new Range,
    AND updates 'area' to point to the next range in a linked list.

    It can assign some custom result value to the range,
    and on updating it can optionally erase the range, either when the result value has changed or always.
*/
const PrepRng = <VT = unknown>(
    ar: Area,         // Given area
    srcE?: HTMLElement,  // Source element, just for error messages
    text: string = '',  // Optional text for error messages
    nWipe?: 1|2,    // 1=erase 'ar.r' when 'res' has changed; 2=erase always
    res?: any,      // Some result value to be remembered
) : {
    r: Range<ChildNode, VT>,     // The newly created or updated child range
    sub: Area,       // The new sub area
    cr: booly    // True when the sub-range has to be created
} =>
{
    let {parN, r, bR} = ar as AreaR,
        sub: Area = {parN, bR }
        , cr = !r;
    if (cr) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        
        r = sub.parR = new Range(ar, N
            , srcE ? srcE.tagName + (text && ' ' + text) : text
            );
    }
    else {
        sub.r = r.ch || T;
        ar.r = r.nx || T;

        if (cr = nWipe && (nWipe>1 || res != r.res)) {
            (sub.parR = r).erase(parN); 
            sub.r = N;
            sub.bfor = r.Nxt;
        }
    }
    r.res=res;
    
    return {r, sub, cr} as {r: Range<ChildNode, VT>, sub: Area, cr: booly};
}

/*
    When creating, build a new range containing a new HTMLElement.
    When updating, return the the range created before.
    Also returns a subarea to build or update the elements childnodes.
*/
, PrepElm = <T={}>(
    ar: Area, 
    tag: string,
    elm?: HTMLElement
): {
    r: Range<hHTMLElement> & T    // Sub-range
    , chAr: Area                    // Sub-area
    , cr: boolean                  // True when the sub-range is being created
} => {
    let r = ar.r as Range<HTMLElement> & T,
        cr = !r;
    if (cr)
        r = new Range(ar,
                elm 
                || ar.parN.insertBefore<HTMLElement>(D.createElement(tag), ar.bfor)
            ) as Range<HTMLElement> & T;
    else
        ar.r = r.nx || T;

    nodeCnt++
    return { 
        r, 
        chAr: {
            parN: r.node, 
            r: r.ch, 
            bfor: N,
            parR: r
        },
        cr
    };
}

/*
    Prepare a sub area of a given 'area',
    and on creating insert either a comment or a text node.

    On updating, update 'area' to point to the next range.
*/
, PrepData = (ar: Area, data: string, bC?: boolean) => {
    let r = ar.r as Range<CharacterData>;
    if (!r)
        new Range(ar,
            ar.parN.insertBefore(
                bC ? D.createComment(data) : D.createTextNode(data)
                , ar.bfor)
        );
    else {
        r.node.data = data;
        ar.r = r.nx || T;
    }
    nodeCnt++;
}

    //, NewEnv  = () => [N] as Environment
,   dU: DepE<any> 
            = _ => U,                // Undefined dependent value
    dB: DOMBuilder 
            = async ()=>{},         // A dummy DOMBuilder
    // Child windows to be closed when the app is closed
    chiWins 
            = new Set<Window>(),
    // Map of all Otoreact modules that are being fetched and compiled, so they won't be fetched and compiled again
    OMods
            = new Map<string, Promise<[DOMBuilder, Context]>>()
            ;

type Subscriber<T = unknown> = 
    ((t?: T) => (unknown|Promise<unknown>)) &
    {   ar?: Area; };

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
type Parameter = {mode: string, nm: string, pDf: Dep<unknown>};
// A SIGNATURE describes an RHTML user construct: a component or a slot
class Signat {
    constructor(
        public srcE: Element        
    ){ 
        this.nm = srcE.tagName;
    }
    public nm: string;
    public Params: Array<Parameter> = [];   // Parameters
    public RP: string;            // Rest parameter (is also in Params)
    public Slots = new Map<string, Signat>();
    public CSlot: Signat;    // Content slot (is also in Slots)

    // In case of a non-async <import>, details of the signature will initially be missing, and the compilation of instances shall await this promise for the signature to be completed
    public task: Promise<any>;              

    // Check whether an import signature is compatible with the real module signature
    IsCompat(sig: Signat): booly {
        if (!sig) return ;
        let c = <booly>T,
            mParams: Map<string, booly> = new Map(mapI(sig.Params,p => [p.nm, p.pDf]));
        // All parameters in the import must be present in the module
        for (let {nm, pDf} of this.Params)
            if (mParams.has(nm)) {
                // When optional in the import, then also optional in the module
                c &&= (!pDf || mParams.get(nm));
                mParams.delete(nm);
            }
            else c = F
        // Any remaining module parameters must be optional
        for (let pDf of mParams.values())
            c &&= pDf;

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
    env?: Environment,   // Environment at the point the construct was declared
    //Cnm?: string  // In case of a slot construct: the component name to which the slot belongs
};
/*
*/
type ArgSet = {[nm: string]: unknown};
type Template =
    (args: ArgSet, mSlotTemplates: Map<string, Template[]>, slotEnv: Environment, ar: Area)
    => Promise<void>;


interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export class _RVAR<T = unknown>{
    public name?: string;
    constructor(
        name?: string, 
        init?: T | Promise<T>, 
        store?: Store,
        storeNm?: string,
    ) {
        this.name = name || storeNm;
        if (name) G[name] = this;

        if (store) {
            let sNm = storeNm || R.Settings.storePrefix + name
                , s = store.getItem(sNm);
            if (s)
                try { init = JSON.parse(s); }
                catch{}
            this.Subscribe(v => 
                store.setItem(sNm, JSON.stringify(v ?? N))
            );
        }
        init instanceof Promise ? 
            init.then( v => this.V = v,  on.e)
            : (this.v = init)
    }
    // The value of the variable
    v: T;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    _Subs: Set<Subscriber<T>> = new Set();
    _Imm: Set<Subscriber<T>> = new Set();

    // Add a subscriber 's', when it is not null.
    // When 'bImm' is truthy, the subscriber will be called immediately when the RVAR is set dirty;
    // otherwise it will be called by the 'DoUpdate' loop.
    // When 'cr' is truthy, it will be called immediately at the moment of subscribing.
    Subscribe(s: Subscriber<T>, bImm?: boolean, cr?: boolean) {
        if (s) {
            if (cr)
                s(this.v);
            (bImm ? this._Imm : this._Subs).add(s);
        }
        return this;
    }
    Unsubscribe(s: Subscriber<T>) {
        this._Imm.delete(s);
        this._Subs.delete(s);
    }
    // Use var.V to get or set its value
    get V() { return this.v }
    // When setting, it will be marked dirty.
    set V(v: T) {
        if (v !== this.v) {
            this.v = v;
            this.SetDirty();
        }
    }
    get Set() : (t:T | Promise<T>) => T | Promise<T>
    {
        return t =>
            t instanceof Promise ?
                ( (this.V = U), t.then(v => this.V = v, on.e))
                : (this.V = t);
    }
    get Clear() {
        return _ => 
            DVars.has(this) || (this.V=U);
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to to set the value and mark the rvar as dirty, even when the value has not changed.
    get U() { 
        ro || this.SetDirty();  
        return this.v }
    set U(t: T) { this.v = t; this.SetDirty(); }

    public SetDirty() {
        for (let sub of this._Imm)
            sub(this.v);
        if (this._Subs.size) {
            DVars.add(this);
            RUpd();
        }
    }

    toString() {
        return this.v?.toString() ?? '';
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

        
function Subscriber({parN, parR}: Area, b: DOMBuilder, r: Range, re:number=1): Subscriber {
    let ar: Area = {parN, parR, r: r||T },
        eon = {env, on};

    return ass(
        () => (
                ({env, on} = eon),
                b({...ar}, re)
        )
        , {ar});
}

let    
/* Runtime data */
    env: Environment,       // Current runtime environment
    on = {e: <Handler>N, s: <Handler>N},    // Current onerror and onsuccess handlers

    // Dirty variables, which can be either RVAR's or RVAR_Light
    DVars = new Set<{_Subs: Set<Subscriber>;}>(),

    hUpdate: number,        // Handle to a scheduled update
    ro: boolean = F,    // True while evaluating element properties so RVAR's should not be set dirty

    upd = 0,       // Iteration count of the update loop; used to make sure a DOM element isn't updated twice in the same iteration
    nodeCnt = 0,      // Count of the number of nodes
    start: number,
    NoTime = <T>(prom: Promise<T>) => {
        let t= now();
        return prom.finally(() => { start += now()-t; })
    },
    RUpd = () => {
        if (!env && !hUpdate)
            hUpdate = setTimeout(DoUpdate, 1);
    }
;

export async function DoUpdate() {
    hUpdate = N;
    if (!env && DVars.size) {
        env = E;
        nodeCnt = 0;
        let u0 = upd;
        start = now();
        while (DVars.size) {
            let dv = DVars;
            DVars = new Set();
            if (upd++ - u0 > 25)
            { alert('Infinite react-loop'); break; }
            for (let rv of dv)
                for (let subs of rv._Subs)
                    try { 
                        let P = subs(rv instanceof _RVAR ? rv.v : rv);
                        if (subs.ar)
                            await P;
                    }
                    catch (e) {    
                        console.log(e = `ERROR: ` + Abbr(e,1000));
                        alert(e);
                    }
        }
        R.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        env=U;
    }
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
    ).Subscribe(subs, T);
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
                        
                        (t as RVAR_Light<T>)._UpdTo?.forEach(
                            rvar => rvar.SetDirty());
                        
                        RUpd();
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
    depV: Dep<unknown>,
    c?: booly,      // Truthy when nm has been checked for proper casing
    isS?: booly,    // Truthy when the property type is string
}
type RestParameter = Array<{M: Modifier, v: unknown}>;

/* Apply modifier 'M' with actual value 'val' to element 'elm'.
    'cr' is true when the element is newly created. */
function ApplyMod(elm: hHTMLElement, M: Modifier, val: unknown, cr: boolean) {
    let {mt, nm} = M;
    if (!M.c) {
        // Replace setting 'valueasnumber' in '<input type=number @valueasnumber=...' by setting 'value'
        if (mt == MType.Prop && nm=='valueasnumber' && (elm as HTMLInputElement).type == 'number')
            nm = 'value';
        // For properties and events, find the correct capitalization of 'nm'.
        M.c = nm = M.nm =
            ( mt == MType.Style && ChkNm(elm.style, nm)
            || (mt == MType.Prop || mt == MType.Event) && ChkNm(elm, nm)
            || nm);
    }
    switch (mt) {
        case MType.Attr:
            elm.setAttribute(nm, val as string); 
            break;
        case MType.Src:
            elm.setAttribute('src',  new URL(val as string, nm).href);
            break;
        case MType.Prop:
            // Avoid unnecessary property assignments; they may have side effects
            if (M.isS ??= typeof elm[nm]=='string')
                if (val==N)
                    val = ''
                else if (typeof val != 'string')
                    val = val.toString();
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
            elm.style[nm] = val || val === 0 ? val : N;
            break;
        case MType.AddToStyle:
            if (val) 
                for (let [nm,v] of Object.entries(val as Object))
                    elm.style[nm] = v || v === 0 ? v : N;
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
                ApplyMod(elm, M, v, cr);
            break;
        case MType.oncreate:
            cr && (val as ()=>void).call(elm);
            break;
        case MType.onupdate:
            !cr && (val as ()=>void).call(elm); 
    }
}
function ApplyMods(elm: HTMLElement, mods: Modifier[], cr?: boolean) {
    // Apply all modifiers: adding attributes, classes, styles, events
    ro= T;
    try {
        for (let M of mods)
            // See what to do with it
            ApplyMod(elm, M, M.depV.call(elm)    // Evaluate the dependent value in the current environment
                    , cr);
    }
    finally { ro = F; }
}

class RCompiler {

    static iNum=0;
    public num = RCompiler.iNum++;  // Rcompiler instance number, just for identification dureing debugging

    private CT: Context         // Compile-time context

    private cRvars: {[nm: string]: booly}
         = {}; //RVAR names that were named in a 'reacton' attribute, so they surely don't need auto-subscription

    private doc: Document;
    private head: Node;
    public FilePath: string;
 
    constructor(
        RC?: RCompiler,
        FilePath?: string,
        settings?: Settings,
        CT = RC?.CT,
    ) { 
        this.Settings   = {... RC ? RC.Settings : defaults, ...settings};
        this.FilePath  = FilePath || RC?.FilePath;
        this.doc = RC?.doc || D
        this.head  = RC?.head || this.doc.head;
        this.CT    = new Context(CT, T);
    }
/*
    'Framed' compiles a range of RHTML within a new variable-frame.
    Its parameter 'Comp' is the actual compiling routine, which is executed in a modified context,
    and receives a parameter 'SS' to be used in the builder routine created by 'Comp' to
    convert the environment 'env' into a new frame, and that returns a routine 'EndScope' to restore the precious environment
*/  
    private  Framed<T>(
        Comp: (
            StartScope: (sub: Area, r?:Range) => {sub: Area, ES: () => void }
        )=>Promise<T>
    ): Promise<T> {
        let {CT, rActs} = this
            , {ct,d,L,M} = CT
            , A = rActs.length
            , nf: booly = L - M; // Do we need a new frame, or is a copy all right
        if (nf) {
            // Modify the context to account for the new frame
            CT.ct = `[${ct}]`;
            CT.d++;
            CT.L = CT.M = 0;
        }

        return Comp(
            // 'StartScope' routine
            (sub, r?) => {
                r || ({r,sub} = PrepRng(sub));
                let e = env;
                env = (r.val as Environment) ||= [nf ? e : e[0]]; 
                return {sub, ES: () => {env = e} }; // 'EndScope' routine
            }
        ).finally(() =>        
        {
            // Restore the context
            ass(this.CT = CT, <Context>{ct,d,L,M});
            
            // When new variables or constructs have been set in the maps,
            // 'rActs' contains the restore actions to restore the maps to their previous state
            while (rActs.length > A) 
                rActs.pop()();
        });
    }

    private rActs: Array<() => void> = [];  // Restore actions

    /* Start a new scope, while staying in the same frame.
        Returns a routine 'EndScope' to end the scope.
    */
    private SS() {
        // Remember the current context    
        let {CT, rActs} = this
            , {ct, L} = CT
            , A=rActs.length;

        return () => {  // 'EndScope' routine
            // Restore the previous context string
            CT.ct = ct
            // As the current environment frame contains new variable values that may not be destroyed
            // (because there may be 'Subscriber' updating routines that refer to the frame),
            // we add empty places to the 'ct' string of visible variable names
                    + ','.repeat(CT.L - L);
            // For the same reason, CT.L and CT.M must not may be restored.

            // When new variables or constructs have been set in the maps of visible variables and constructs,
            // 'rActs' contains the restore actions to restore the maps to their previous state
            while (rActs.length > A)
                rActs.pop()();
        }
    }

    // At compiletime, declare a single LVar.
    // Returns a routine to set the value of the LVar.
    private LVar<T>(nm: string): LVar<T> {
        //let lv: LVar<T>;
        if (!(nm = nm?.trim()))
            // An empty variable name results in a dummy LVar
           var lv = dU as any as LVar<T>;
        else {
            // Check valid JavaScript identifier
            if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm)) throw `Invalid identifier '${nm}'`;

            // Check for reserved keywords
            try { Ev(US+`let ${nm}=0`); }
            catch { throw `Reserved keyword '${nm}'`; }

            let {CT} = this
                , L = ++CT.L        // Reserve a place in the environment
                , vM = CT.lvMap
                , p = vM.get(nm);    // If another variable with the same name was visible, remember its key

            // Set the key for the new variable
            vM.set(nm , [CT.d,L]);

            // Register a routine to restore the previous key
            this.rActs.push(() => mapSet(vM,nm,p));

            // Add the name to the context string, after removing a previous occurence of that name
            CT.ct = CT.ct.replace(new RegExp(`\\b${nm}\\b`), '') 
                    + ',' + nm;

            // The routine to set the value
            lv = (v => (env[L] = v) ) as LVar<T>
        }
        lv.nm = nm; // Attach the name of the Lvar to the routine
        return lv;        
    }
    // Declare an number of LVar's, according to a comma-separated 'varList'.
    // Returns an array of LVar setters.
    private LVars(varlist: string): Array<LVar> {
        return Array.from(split(varlist), nm => this.LVar(nm));
    }

    // At compiletime, declare a number of local constructs, according to the supplied signatures.
    // Returns a single routine to set them all at once.
    private LCons(listS: Iterable<Signat>) {
        let {CT} = this
            , {csMap: cM, M}= CT;

        for (let S of listS) {
            let p = cM.get(S.nm);
            cM.set(S.nm, {S, k: [CT.d, --CT.M]});
            this.rActs.push(() => mapSet(cM,S.nm,p));
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
        nodes?: Iterable<ChildNode>,  // Compile the element itself, or just its childnodes
    ) {
        for (let tag of this.Settings.preformatted)
            this.setPRE.add(tag.toUpperCase());
        let t0 = now();
        this.bldr =
            ( nodes
            ? await this.CChilds(elm, nodes)
            : await this.CElm(elm as HTMLElement, T)
            ) || dB;
        this.log(`Compiled ${this.srcNodeCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
        return this.bldr;
    }

    log(msg: string) {
        if (this.Settings.bTiming)
            console.log(new Date().toISOString().substring(11)+` ${this.num}: `+msg);
    }

    private setPRE = new Set(['PRE']);

    public async Build(ar: Area) {
        let saveR = R;
        R = this;
        env = [];   // = NewEnv()
        try {
            await this.bldr(ar);
        }
        finally {
            env = U;
            R = saveR;       
        }
        await DoUpdate();
    }

    public Settings: FullSettings;
    public bldr: DOMBuilder;

    private ws = WSpc.block;  // While compiling: whitespace mode for the node(s) to be compiled; see enum WSpc
    private rspc: booly = T;     // While compiling: may the generated DOM output be right-trimmed
    

    private srcNodeCnt = 0;   // To check for empty Content

    private CChilds(
        srcParent: ParentNode,
        nodes: Iterable<ChildNode> = srcParent.childNodes,
    ): Promise<DOMBuilder> {
        let ES = this.SS(); // Start scope
        return this.CIter(nodes).finally(ES)
    }

    // Compile some stretch of childnodes
    private async CIter(iter: Iterable<ChildNode>): Promise<DOMBuilder> {
        let {rspc} = this     // Indicates whether the output may be right-trimmed
            , arr = Array.from(iter);
        while(rspc && arr.length && reWS.test(arr[arr.length - 1]?.nodeValue)) 
            arr.pop();
        
        let bldrs = await this.CArr(arr, this.rspc);

        return bldrs.length ? 
            async function Iter(ar: Area)
            {   
                for (let b of bldrs)
                    await b(ar);
            }
        : N;
    }

    private async CArr(arr: Array<ChildNode>, rspc: booly, i=0) : Promise<DOMBuilder[]> {
        let bldrs = [] as Array< DOMBuilder >
            , L = arr.length
            , rv: string
        while (i<L) {
            let srcN = arr[i++], bl: DOMBuilder;
            this.rspc = i==L && rspc;
            switch (srcN.nodeType) {
                
                case 1:         //Node.ELEMENT_NODE:
                    this.srcNodeCnt ++;
                    bl = await this.CElm(srcN as HTMLElement);

                    if (rv = bl?.auto)
                        // Handle auto-subscription
                        try {
                            // Check for compile-time subscribers
                            bldrs.push(bl);

                            var s = this.cRvars[rv],    // Save previous value
                                // Compile remaining nodes, but first set this.cRvars[rv] to something truthy
                                bs = await this.CArr(arr, rspc, this.cRvars[rv] =  i),
                                gv = this.CT.getLV(rv) as DepE<RVAR>;

                            // Were there no compile-time reacts for this rvar?
                            bl = bs.length && this.cRvars[rv]
                                ? async function Auto(ar: Area) {
                                        let {r, sub, cr} = PrepRng(ar);
                                        if (cr) {
                                            let rvar = gv(), s = rvar._Subs.size;
                                            for (let b of bs)
                                                await b(sub);
                                            if (rvar._Subs.size==s) // No new subscribers still?
                                                // Then auto-subscribe with the correct range
                                                rvar.Subscribe(
                                                    Subscriber(ar, Auto, r)
                                                );
                                        }
                                        else if (r.upd != upd)
                                            for (let b of bs)
                                                await b(sub);
                                        
                                        r.upd = upd;                                      
                                    }
                                : (bldrs.push(...bs), N);
                            i = L;
                        }
                        finally { this.cRvars[rv] = s; }
                    break;

                case 3:         //Node.TEXT_NODE:
                    this.srcNodeCnt ++;
                    let str = srcN.nodeValue
                        , getText = this.CText( str ), {fx} = getText;
                    if (fx !== '') { // Either nonempty or undefined
                        bl = async (ar: Area) => PrepData(ar, getText());
                        
                        // Update the compiler whitespace mode
                        if (this.ws < WSpc.preserve)
                            this.ws = / $/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    break;

                case 8:         //Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        let getText = this.CText(srcN.nodeValue, 'Comment');
                        bl = async (ar:Area)=> PrepData(ar, getText(), T);
                    }
                    // 'break' not required
            }
            
            if (bl) 
                bldrs.push(bl);
        }
        
        return bldrs;
    }

    // Compile any source element
    private async CElm(srcE: HTMLElement, bUnhide?: boolean
        ): Promise<DOMBuilder> {       
        try {
            let 
                tag = srcE.tagName,
                // List of source attributes, to check for unrecognized attributes
                atts =  new Atts(srcE),
                CTL = this.rActs.length,

                // Global attributes (this)react(s)on / hash / if / renew handlers
                glAtts: Array<{att: string, m: RegExpExecArray, dV: Dep<RVAR[] | unknown[] | booly>}> = [],

                // Generic pseudo-events to be handled BEFORE and AFTER building
                bf: Array<{att: string, txt: string, hndlr?: Dep<Handler>, C: boolean, U: boolean, D: boolean}> = [],
                af: Array<{att: string, txt: string, hndlr?: Dep<Handler>, C: boolean, U: boolean, D: boolean}> = [],
                                
                // The intermediate builder will be put here
                bl: DOMBuilder,
                
                auto: string  // rvar-name that might need auto-subscription

                // See if this node is a user-defined construct (component or slot) instance
                , constr = this.CT.getCS(tag)

                // Pre-declared variables for various purposes
                , b: DOMBuilder
                , m: RegExpExecArray
                , nm: string

                // Check for generic attributes
            for (let [att] of atts)
                if (m = 
                     /^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(?:create|update|destroy)+)$/
                     .exec(att))
                    if (m[1])       // (?:this)?reacts?on|on
                        m[4] && tag!='REACT'    // 'on' is only for <REACT>
                        || m[7] && tag=='FOR'   // <FOR> has its own 'hash'
                        ||                      // other cases are put in the list:
                            glAtts.push(
                                {
                                    att, 
                                    m, 
                                    dV: 
                                        m[5]  // on((error)|success)
                                            ? this.CHandlr(att, atts.g(att))
                                        : m[8] // if
                                            ? this.CAttExp(atts, att)
                                        :   // reacton, hash
                                          this.CAttExpList<RVAR>(atts, att, T)
                                });
                    else { // #?(before|after|on)(create|update|destroy)+
                        let txt = atts.g(att);
                        // We have a pseudo-event
                        (m[9] ? bf : af)    // Is it before or after
                        .push(
                            {
                                att, 
                                txt, 
                                C:/c/.test(att),    // contains 'create'
                                U:/u/.test(att),    // contains 'update'
                                D:/y/.test(att),    // contains 'destroy'
                                    // 'before' events are compiled now, before the element is compiled
                                    // 'after' events are compiled after the element has been compiled, so they may
                                    // refer to local variables introduced by the element.
                                hndlr: m[9] && this.CHandlr(att,txt)
                            });
                    }

            if (bUnhide) atts.set('#hidden', 'false'); 
            if (constr)
                bl = await this.CInstance(srcE, atts, constr);
            else {
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE': {
                        NoChilds(srcE);
                        let rv      = atts.g('rvar'), // An RVAR
                            t = '@value', 
                            twv     = rv && atts.g(t),
                            dGet    = twv ? this.CExpr(twv,t) : this.CParam(atts, 'value'),
                            bUpd    = atts.gB('reacting') || atts.gB('updating') || twv,

                            // When we want a two-way rvar, we need a routine to update the source expression
                            dSet    = twv && this.CTarget(twv),
                            dUpd    = rv   && this.CAttExp<RVAR>(atts, 'updates'),
                            dSto    = rv   && this.CAttExp<Store>(atts, 'store'),
                            dSNm    = dSto && this.CParam<string>(atts, 'storename'),
                            vLet    = this.LVar(rv || atts.g('let') || atts.g('var', T)),
                            vGet    = rv && this.CT.getLV(rv) as DepE<RVAR>,
                            onMod   = rv && this.CParam<Handler>(atts, 'onmodified');

                        auto = rv && atts.gB('auto', this.Settings.bAuto) && !onMod && rv; 
                        bl = async function DEF(ar, re?: number) {
                                let r = ar.r
                                    , v: unknown, upd: RVAR;
                                // Evaluate the value only when:
                                // !r   : We are building the DOM
                                // bUpd : 'updating' was specified
                                // re:  : The routine is called because of a 'reacton' subscribtion
                                if (!r || bUpd || re){
                                    try {
                                        ro=T;
                                        v = dGet?.();
                                    }
                                    finally { ro = F; }

                                    if (rv)
                                        if (r)
                                            vGet().Set(v);
                                        else
                                            (vLet as LVar<RVAR>)(
                                                RVAR(N, v,
                                                    dSto?.(),
                                                    dSet?.(), 
                                                    dSNm?.() || rv
                                                )
                                            )
                                            .Subscribe((upd = dUpd?.()) && (()=>upd.SetDirty()))
                                            .Subscribe(onMod?.());
                                    else
                                        vLet(v);
                                }
                            }
                       
                    } break;

                    case 'IF':
                    case 'CASE': 
                        bl = await this.CCase(srcE, atts);
                    break;

                    case 'FOR':
                        bl = await this.CFor(srcE, atts);
                    break;

                    case 'MODULE': // Skip completely!
                        atts.g('id');
                        break;
                        
                    case 'INCLUDE':
                        let src = atts.g('src', T);
                        bl = await (
                            srcE.children.length || srcE.textContent.trim()
                            ? this.CChilds(srcE)
                            :  this.Framed(async SS => {
                                // Placeholder that will contain a Template when the file has been received
                                let  C: RCompiler = new RCompiler(this, this.GetPath(src), {bSubfile: T})
                                    , task = 
                                        // Parse the contents of the file
                                        // Compile the parsed contents of the file in the original context
                                        C.Compile(N, await this.fetchModule(src))
                                        .catch(e => {alert(e); throw e});
                                return async function INCLUDE(ar) {
                                        let b = await NoTime(task)
                                            , {sub,ES} = SS(ar);
                                        await b(sub).finally(ES);
                                    };
                            })
                        );
                    break;

                    case 'IMPORT': {
                        let src = atts.g('src', T)
                            , bIncl = atts.gB('include')
                            , bAsync = atts.gB('async')
                            , lvars: Array<LVar & {g?: DepE<unknown>}> 
                                        = this.LVars(atts.g('defines'))
                            , imps: Array<Signat & {g?: DepE<ConstructDef>}>
                                        = Array.from(mapI(srcE.children, ch => this.CSignat(ch)))
                            , DC = this.LCons(imps)
                            , cTask: Promise<[DOMBuilder, Context]>
                                = OMods.get(src)   // Check whether module has already been compiled
                            ;
                            
                        if (!cTask) {
                            // When the same module is imported at multiple places, it needs to be compiled only once
                            let C = new RCompiler(this, this.GetPath(src), {bSubfile: T}, new Context());
                            C.log(src);
                            OMods.set(src
                                , cTask = C.CIter(await this.fetchModule(src))
                                            .then(b => [b, C.CT]
                                                , e => {alert(e); throw e}
                                            )
                            );
                        }

                        // Converting the module into getters for each imported objects needs to be done
                        // once for every place where it is imported
                        let task: Promise<DOMBuilder>
                             = cTask.then(([b, CT]) => {
                                // Check or register the imported signatures
                                for (let sig of imps) {

                                    let {S,dC} = CT.getCS(sig.nm) 
                                        || thro(`<${sig.nm}> is missing in '${src}'`);
                                    // When async, we need to check the imported and the module signatures for compatibility
                                    bAsync
                                    ? !sig.IsCompat(S) && thro(`Import signature ${sig.srcE.outerHTML} is incompatible with module signature ${S.srcE.outerHTML}`)
                                    // When not async, we copy the module signature to the imported signature
                                    : ass(sig, S)                                    
                                    ;
                                    sig.g = dC;
                                }
                                for (let lv of lvars)
                                    lv.g = CT.getLV(lv.nm); // (this includes error checking)
                                return b;
                            });
                        
                        if (!bAsync) {
                            // Before an instance is compiled, the compiler should wait for the module
                            for (let sig of imps)
                                sig.task = task;
                        }
                        
                        bl = async function IMPORT(ar: Area) {
                            let {sub,cr,r}=PrepRng<Environment>(ar, srcE)
                            if (cr || bIncl) {
                                try {
                                    var b = await NoTime(task)
                                        , s = env
                                        , MEnv = env = r.val ||= []; // = NewEnv()
                                    await b(bIncl ? sub : {parN: D.createDocumentFragment()});
                                }
                                finally { env = s; }
                                // Now 'MEnv' contains all definitions from the module.
                                // We copy the wanted ones into the current env
                                
                                DC(mapI(imps, S => S.g(MEnv) as ConstructDef));
                                    
                                for (let lv of lvars)
                                    lv(lv.g(MEnv));
                            }
                        };
                    } break;

                    case 'REACT':
                        bl = await this.CChilds(srcE);
                    break;

                    case 'RHTML': {
                        NoChilds(srcE);
                        let dSrc = this.CParam<string>(atts, 'srctext', T)
                        //  , imports = this.CAttExp(atts, 'imports')
                            , mods = this.CAtts(atts)
                            , C = new RCompiler(N, this.FilePath, {bSubfile: T, bTiming: this.Settings.bTiming})
                            , {ws,rspc} = this
                        this.ws=WSpc.block;
                       
                        bl = async function RHTML(ar) {
                            let src = dSrc()
                                , {r, cr} = PrepElm(ar, 'rhtml-rhtml')
                                , {node} = r;
                            ApplyMods(node, mods, cr);

                            if (src != r.res) {
                                r.res = src;
                                let 
                                    s = env,
                                    sRoot = C.head = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = D.createElement('rhtml'),
                                    sAr = {
                                        parN: sRoot,
                                        parR: r.ch ||= new Range(N, N, 'Shadow')
                                    };

                                r.ch.erase(sRoot); sRoot.innerHTML='';
                                try {
                                    // Parsing
                                    tempElm.innerHTML = src;
                                    // Compiling
                                    await ass(C, {ws,rspc, CT: new Context()}
                                        ).Compile(tempElm, tempElm.childNodes);
                                    // Building
                                    await C.Build(sAr);
                                }
                                catch(e) { 
                                    sRoot.appendChild(createErrNode(`Compile error: `+e))
                                }
                                finally { env = s; }
                            }
                        };
                    } break;

                    case 'SCRIPT': 
                        bl = await this.CScript(srcE as HTMLScriptElement, atts); 
                        break;

                    case 'STYLE':
                        this.head.appendChild(srcE);
                        break;

                    case 'COMPONENT':
                        bl = await this.CComponent(srcE, atts);
                        break;

                    case 'DOCUMENT':
                        let vDoc = this.LVar(atts.g('name', T)),
                            bEncaps = atts.gB('encapsulate'),
                            RC = new RCompiler(this),
                            vParams = RC.LVars(atts.g('params')),
                            vWin = RC.LVar(atts.g('window')),
                            docBldr = ((RC.head = D.createDocumentFragment()), await RC.CChilds(srcE));
                        bl = async function DOCUMENT(ar: Area) {
                            if (!ar.r) {
                                let doc = ar.parN.ownerDocument,
                                    docEnv = env,
                                    wins = new Set<Window>();
                                vDoc({
                                    async render(w: Window, cr: boolean, args: unknown[]) {
                                        let s = env, d = w.document;
                                        env = docEnv;
                                        SetLVars(vParams, args);
                                        vWin(w);
                                        try {
                                            if (cr) {
                                                // Copy all style sheet rules
                                                if (!bEncaps)
                                                    copySSheets(doc, d);
                                                for (let S of RC.head.childNodes)
                                                    d.head.append(S.cloneNode(T));
                                            }
                                            let ar: Area = {parN: d.body, r: (w as any).r};
                                            await docBldr(ar);
                                        }
                                        finally {env = s}
                                    },
                                    open(target?: string, features?: string, ...args: unknown[]) {
                                        let w = W.open('', target || '', features)
                                            , cr = !chiWins.has(w);
                                        if (cr) {
                                            w.addEventListener('keydown', 
                                                function(this: Window,event:KeyboardEvent) {if(event.key=='Escape') this.close();}
                                            );
                                            w.addEventListener('close', () => chiWins.delete(w), wins.delete(w))
                                            chiWins.add(w); wins.add(w);
                                        }
                                        else
                                            w.document.body.innerHTML=''
                                        this.render(w, cr, args);
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
                                });
                            }
                        }
                    break;

                    case 'RHEAD':
                        let {ws} = this;
                        b = await this.CChilds(srcE);
                        this.ws = this.rspc = WSpc.block;
                        this.ws = ws;
                        
                        bl = b && async function HEAD(ar: Area) {
                            let {sub} = PrepRng(ar, srcE);
                            sub.parN = ar.parN.ownerDocument.head;
                            sub.bfor = N;
                            await b(sub);
                            if (sub.prvR)
                                sub.prvR.parN = sub.parN;
                        }
                    break;

                    case 'RSTYLE':
                        let s: [boolean, RegExp, WSpc]
                            = [this.Settings.bDollarRequired, this.rIS, this.ws];
                        try {
                            this.Settings.bDollarRequired = T; this.rIS = N;
                            this.ws = WSpc.preserve;
                            b = await this.CChilds(srcE);
                        
                            bl = b && function RSTYLE(ar: Area) {
                                return b(PrepElm(ar, 'STYLE').chAr);
                            };
                        }
                        finally {
                            [this.Settings.bDollarRequired, this.rIS, this.ws] = s;
                        }
                        break;

                    case 'ELEMENT':                        
                        bl = await this.CHTMLElm(
                            srcE, atts
                            , this.CParam(atts, 'tagname', T)
                        );
                        this.ws = WSpc.inline;
                        break;

                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dNm = this.CParam<string>(atts, 'name', T),
                            dVal= this.CParam<string>(atts, 'value', T);
                        bl = async function ATTRIB(ar: Area){
                            let r = PrepRng<string>(ar, srcE).r,
                                nm = dNm(),
                                p = ar.parN as HTMLElement;
                            if (r.val && nm != r.val)
                                p.removeAttribute(r.val);
                            if (r.val = nm)
                                p.setAttribute(nm, dVal());
                        };
                        break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        bl = await this.CHTMLElm(srcE, atts);
                }
                atts.NoneLeft();
            }
            
            nm = (bl ||= dB).name;

            // Add pseudo-event handling
            if (bf.length + af.length) {
                for (let g of af)
                    g.hndlr = this.CHandlr(g.att, g.txt);
                let b = bl;
                bl = async function Pseudo(ar: AreaR, x:any) {
                    let {r,prvR} = ar, bfD: Handler;
                    for (let g of bf) {
                        if (g.D)
                            bfD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(
                                r?.node || ar.parN
                            );
                    }
                    await b(ar, x);
                    // When b has not created its own range, then we create one
                    let prev = 
                        (r ? ar.r != r && r
                            : ar.prvR!=prvR && ar.prvR
                            ) || PrepRng(ar).r;
                    prev.bfD = bfD;
                    for (let g of af) {
                        if (g.D)
                            prev.afD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(
                                prev.node || ar.parN
                            );
                    }
                }
            }

            // Compile global attributes
            for (let {att, m, dV} of this.Settings.version ? glAtts : glAtts.reverse()) {
                let b = bl,
                    rre = m[3] ? 2 : 1,    // 'thisreactson'?
                    es = m[6] ? 'e' : 's';
                bl = 
                    m[2]
                    ?  async function REACT(ar: Area, re: number) {                
                            let {r, sub} = PrepRng(ar, srcE, att);

                            if (r.upd != upd)   // Avoid duplicate updates in the same RUpdate loop iteration
                                await b(sub, re);
                            r.upd = upd;
                            
                            if (!re) {
                                let 
                                    subs: Subscriber = r.subs ||= Subscriber(ar, REACT, r, rre)
                                    , pVars: RVAR[] = r.rvars
                                    , i = 0;

                                for (let rvar of r.rvars = <RVAR[]>dV()) {
                                    if (pVars) {
                                        // Check whether the current rvar(s) are the same as the previous one(s)
                                        let p = pVars[i++];
                                        if (rvar==p)
                                            continue;           // Yes, continue
                                        p._Subs.delete(subs);   // No, unsubscribe from the previous one
                                    }

                                    try { rvar.Subscribe(subs); }
                                    catch { ErrAtt('This is not an RVAR', att) }
                                }
                            }
                        }
                    : m[5]  // onerror|onsuccess
                    ? async function SetOnES(ar: Area,x) {
                            let s = on; 
                            on = {...on}
                            try {
                                on[es] = dV();
                                await b(ar,x);
                            }
                            finally { on = s; }
                        }
                    :   m[7]   // hash
                    ? async function HASH(ar: Area) {
                        let {sub, r,cr} = PrepRng(ar, srcE, 'hash')
                            , hashes = <unknown[]>dV();
    
                        if (cr || hashes.some((hash, i) => hash !== r.val[i])) {
                            r.val = hashes;
                            await b(sub);
                        }
                    }
                    : m[8]  // if
                    ?   function hIf(ar: Area) {
                            let c = <booly>dV(),
                                {sub} = PrepRng(ar, srcE, att, 1, !c)
                            if (c)
                                return b(sub)
                        }
                    :   // Renew
                        function renew(sub: Area) {
                            return b(
                                PrepRng(sub, srcE, 'renew', 2
                                    //, dV ? 1 : 2 , dV?.()
                                ).sub
                            );
                        }
            }

            return bl != dB && ass(
                this.rActs.length == CTL
                ? this.ErrH(bl, srcE)
                : function Elm(ar: Area) {
                    return bl(ar).catch(e => { throw ErrMsg(srcE, e, 39);})
                }
                , {auto,nm});
        }
        catch (e) { throw ErrMsg(srcE, e); }
    }

    private ErrH(bl: DOMBuilder, srcN: ChildNode): DOMBuilder{

        return bl && (async (ar: AreaR) => {
            let r = ar.r;
            if (r?.errN) {
                ar.parN.removeChild(r.errN);
                r.errN = U;
            }
            try {
                await bl(ar);
            } 
            catch (e) { 
                let msg = 
                    srcN instanceof HTMLElement ? ErrMsg(srcN, e, 39) : e;

                if (this.Settings.bAbortOnError)
                    throw msg;
                this.log(msg);
                if (on.e)
                    on.e(e);
                else if (this.Settings.bShowErrors) {
                    let errN =
                        ar.parN.insertBefore(createErrNode(msg), ar.r?.FstOrNxt);
                    if (r)
                        r.errN = errN;    /*  */
                }
            }
        });
    }

    private async CScript(srcE: HTMLScriptElement, atts: Atts) {
        let {type, text, defer, async} = srcE
            // External source?
            , src = atts.g('src')     // Niet srcE.src
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
            , lvars = mOto && mOto[2] && this.LVars(defs)
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
            if (mOto?.[3]) {
                // otoreact/local script
                let prom = (async () => 
                    //this.Closure<unknown[]>(`{${src ? await this.FetchText(src) : text}\nreturn[${defs}]}`)
                    // Can't use 'this.Closure' because the context has changed when 'FetchText' has resolved.
                    Ev(US+
                        `(function([${ct}]){{${src ? await this.FetchText(src) : text}\nreturn[${defs}]}})`
                    ) as DepE<unknown[]>
                    // The '\n' is needed in case 'text' ends with a comment without a newline.
                    // The additional braces are needed because otherwise, if 'text' defines an identifier that occurs also in 'ct',
                    // the compiler gives a SyntaxError: Identifier has already been declared
                    )();
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
                return async function MSCRIPT(ar: Area) {
                    !ar.r && 
                        SetVars(
                            await prom.then(obj => 
                                varlist.map(nm => 
                                    nm in obj ? obj[nm] : thro(`'${nm}' is not exported by this script`)
                                )
                            )
                        );
                }
            }
            else {
                // Classic or otoreact/static or otoreact/global script
                let prom = (async() => `${mOto ? US : ""}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    // Evaluate asynchronously as soon as the script is fetched
                    prom = prom.then(txt => void (exp = Ev(txt)));
                else if (!mOto && !defer)
                    // Evaluate standard classic scripts without defer immediately
                    exp = Ev(await prom);

                return async function SCRIPT(ar: Area) {
                        !ar.r &&
                            SetVars(exp ||= Ev(await prom));
                    };
            }
        }
    }

    private async CCase(srcE: HTMLElement, atts: Atts): Promise<DOMBuilder> {
        let bHiding = atts.gB('hiding'),
            dVal = this.CAttExp<string>(atts, 'value'),
            caseNodes: Array<{
                node: HTMLElement,
                atts: Atts,
                body?: Iterable<ChildNode>,
            }> = [],
            body: ChildNode[] = [];
        
        for (let node of srcE.childNodes) {
            if (node instanceof HTMLElement) 
                switch (node.tagName) {
                    case 'THEN':
                        var bThen = T;
                        new Atts(node as HTMLElement).NoneLeft();
                        caseNodes.push({node, atts});
                        continue;
                    case 'ELSE':
                    case 'WHEN':
                        caseNodes.push({node, atts: new Atts(node as HTMLElement)});
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
                cond?: Dep<unknown>,
                not: boolean,
                patt?: {lvars: LVar[], regex: RegExp, url?: boolean},
                b: DOMBuilder, 
                node: HTMLElement,
            }> = [],
            {ws, rspc, CT}= this,
            postCT = CT,
            postWs: WSpc = 0, // Highest whitespace mode to be reached after any alternative
            bEls: booly;
        
        for (let {node, atts, body} of caseNodes) {
            let ES = 
                ass(this, {ws, rspc, CT: new Context(CT)})
                .SS();
            try {
                let cond: Dep<unknown>, 
                    not: boolean = F,
                    patt:  {lvars: LVar[], regex: RegExp, url?: boolean},
                    p: string,
                    b: DOMBuilder;
                switch (node.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp<unknown>(atts, 'cond');
                        not = atts.gB('not');
                        patt =
                            (p = atts.g('match')) != N
                                ? this.CPatt(p)
                            : (p = atts.g('urlmatch')) != N
                                ? this.CPatt(p, T)
                            : (p = atts.g('regmatch')) != N
                                ?  {regex: new RegExp(p, 'i'), 
                                lvars: this.LVars(atts.g('captures'))
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
                            b: this.ErrH(await this.CChilds(node, body) || dB, node),
                            node
                        });
                        atts.NoneLeft();
                        postWs = Math.max(postWs, this.ws);
                        postCT = postCT.max(this.CT);

                        if (cond === U) bEls=T;
                }
            } 
            catch (e) { throw node.tagName=='IF' ? e : ErrMsg(node, e); }
            finally { ES(); }
        }
        this.ws = !bEls && ws > postWs ? ws : postWs;
        this.CT = postCT;

        return caseList.length && async function CASE(ar: Area) {
            let val = dVal?.()
                , RRE: RegExpExecArray
                , cAlt: typeof caseList[0];
            try {
                // First determine which alternative is to be shown
                for (var alt of caseList)
                    if ( !(
                        (!alt.cond || alt.cond()) 
                        && (!alt.patt || val != N && (RRE = alt.patt.regex.exec(val)))
                        ) == alt.not)
                    { cAlt = alt; break }
            }
            catch (e) { throw alt.node.tagName=='IF' ? e : ErrMsg(alt.node, e); }
            finally {
                if (bHiding) {
                    // In this CASE variant, all subtrees are kept in place, some are hidden
                    for (let alt of caseList) {
                        let {r, chAr, cr} = PrepElm(ar, 'WHEN');
                        if ( !(r.node.hidden = alt != cAlt) && !ar.bR
                            || cr
                        )
                            await alt.b(chAr);
                    }
                }
                else {
                    // This is the regular CASE  
                    let {sub, cr} = PrepRng(ar, srcE, '', 1, cAlt);
                    if (cAlt && (cr || !ar.bR)) {
                        if (RRE)
                            RRE.shift(),
                            SetLVars(
                                cAlt.patt.lvars,
                                cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE                                                
                            )

                        await cAlt.b(sub);
                    }
                }
            }
        }
    }


    private CFor(srcE: HTMLElement, atts: Atts): Promise<DOMBuilder> {

        interface ForRange extends Range {
            prev?: ForRange;
            nx: ForRange;
            key?: Key;
            hash?: Hash; 
            fragm?: DocumentFragment;            
        }

        let letNm = atts.g('let') ?? atts.g('var')
            , ixNm = atts.g('index',U,U,T);
        this.rspc = F;

        if (letNm != N) { /* A regular iteration */
            let dOf =
                this.CAttExp<Iterable<Item> | Promise<Iterable<Item>>>(atts, 'of', T)
                , pvNm = atts.g('previous',U,U,T)
                , nxNm = atts.g('next',U,U,T)
                , dUpd = this.CAttExp<RVAR>(atts, 'updates')
                , bRe: booly = atts.gB('reacting') || atts.gB('reactive') || dUpd;

            return this.Framed(async SS => {
                
                let             
                    // Add the loop-variable to the context, and keep a routine to set its value
                    vLet = this.LVar(letNm),
                    // The same for 'index', 'previous' and 'next' variables
                    vIx = this.LVar(ixNm),
                    vPv = this.LVar(pvNm),
                    vNx = this.LVar(nxNm),

                    dKey = this.CAttExp<Key>(atts, 'key'),
                    dHash = this.CAttExpList<Hash>(atts, 'hash'),

                    // Compile all childNodes
                    b = await this.CIter(srcE.childNodes);

                // Dit wordt de runtime routine voor het updaten:
                return b && async function FOR(this: RCompiler, ar: Area) {
                    let {r, sub} = PrepRng<Map<Key, ForRange>>(ar, srcE, ''),
                        {parN} = sub,
                        bfor = sub.bfor !== U ? sub.bfor : r.Nxt,
                        iter: Iterable<Item> | Promise<Iterable<Item>>
                            = dOf() || E
                    
                        , pIter = async (iter: Iterable<Item>) => {
                            // Check for being iterable
                            if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                                throw `[of] Value (${iter}) is not iterable`

                            // Map of the current set of child ranges
                            let keyMap: Map<Key, ForRange> = r.val ||= new Map(),

                            // Map of the newly obtained data
                                nwMap: Map<Key, {item:Item, hash:Hash[], ix: number}> = new Map(),

                            // First we fill nwMap, so we know which items have disappeared, and can look ahead to the next item.
                            // Note that a Map remembers the order in which items are added.
                                ix=0, {ES} = SS(N, <Range>{});
                            try {
                                for await (let item of iter) {
                                    // Set bound variables, just to evaluate the 'key' and 'hash' expressions.
                                    // Later on, we set them again.
                                    vLet(item);
                                    vIx(ix);
                                    let hash = dHash?.()
                                        , key = dKey?.() ?? hash?.[0];
                                    if (key != N && nwMap.has(key))
                                        throw `Duplicate key '${key}'`;

                                    nwMap.set(key ?? {}, {item, hash, ix: ix++});
                                }
                            }
                            finally { ES() }

                            // Now we will either create or re-order and update the DOM
                            let nxChR = r.ch as ForRange,    // This is a pointer into the created list of child ranges
                                iterator = nwMap.entries(),
                                nxIter = nxNm && nwMap.values()

                                , prItem: Item, nxItem: Item
                                , prvR: Range,
                                chAr: Area;
                            sub.parR = r;

                            nxIter?.next();
                            while(T) {
                                let k: Key, nx = iterator.next();

                                // Remove childranges at the current point with a key that is not in 'nwMap'
                                while (nxChR && !nwMap.has(k = nxChR.key)) {
                                    if (k != N)
                                        keyMap.delete(k);
                                    nxChR.erase(parN);
                                    if (nxChR.subs)
                                        nxChR.rvars[0]._Subs.delete(nxChR.subs);
                                    nxChR.prev = N;
                                    nxChR = nxChR.nx;
                                }

                                if (nx.done) break;

                                // Inspect the next item
                                let [key, {item, hash, ix}] = nx.value as [Key , {item:Item, hash:Hash[], ix: number}]
                                    // See if it already occured in the previous iteration
                                    , chR = keyMap.get(key)
                                    , cr = !chR;

                                if (nxIter)
                                    nxItem = nxIter.next().value?.item;

                                if (cr) {
                                    // Item has to be newly created
                                    sub.r = N;
                                    sub.prvR = prvR;
                                    sub.bfor = nxChR?.FstOrNxt || bfor;
                                    ({r: chR, sub: chAr} = PrepRng(sub, N, `${letNm}(${ix})`));
                                    if (key != N)
                                        keyMap.set(key, chR);
                                    chR.key = key;
                                }
                                else {
                                    // Item already occurs in the series; chRng points to the respective child range
                                    
                                    if (chR.fragm) {
                                        // We had set aside the nodes resulting from this item in a 'documentFragment', and now we only have to insert these nodes
                                        parN.insertBefore(chR.fragm, nxChR?.FstOrNxt || bfor);
                                        chR.fragm = N;
                                    }
                                    else
                                        while (T) {
                                            if (nxChR == chR)
                                                // The child range is already in place, no need to move it
                                                nxChR = nxChR.nx;
                                            else {
                                                // Item has to be moved; we use two methods
                                                if (nwMap.get(nxChR.key)?.ix > ix + 3) {
                                                    // Either move the range at the current point into a 'documentFragment', and continue looking
                                                    (nxChR.fragm = D.createDocumentFragment()).append(...nxChR.Nodes());
                                                    
                                                    nxChR = nxChR.nx;
                                                    continue;
                                                }
                                                // Or just move the nodes corresponding to the new next item to the current point
                                                chR.prev.nx = chR.nx;
                                                if (chR.nx)
                                                    chR.nx.prev = chR.prev;
                                                let nxNode = nxChR?.FstOrNxt || bfor;
                                                for (let node of chR.Nodes())
                                                    parN.insertBefore(node, nxNode);
                                            }
                                            break;
                                        }

                                    // Update pointers
                                    chR.nx = nxChR;
                                    chR.text = `${letNm}(${ix})`;
                                    if (prvR) 
                                        prvR.nx = chR;
                                    else
                                        r.ch = chR;
                                    sub.r = chR;
                                    // Prepare child range
                                    chAr = PrepRng(sub).sub;

                                    sub.parR = N;
                                }
                                chR.prev = prvR;
                                prvR = chR;
                                // Does this range need building or updating?
                                if (cr ||
                                    !hash ||  hash.some((h,i) => h != chR.hash[i]
                                )
                                ) {
                                    chR.hash = hash;

                                    // Environment instellen
                                    let {sub, ES} = SS(chAr, chR);
                                    try {
                                        if (bRe && (cr || item != chR.rvars[0]))
                                        {
                                            // Turn 'item' into an RVAR_Light
                                            RVAR_Light<Item>(item, dUpd && [dUpd()]);
                                            // If this item comes in place of another item, then keep its subscribers
                                            if (chR.subs)
                                                (item as RVAR<Item>)._Subs = chR.rvars[0]._Subs;
                                            chR.rvars = [item as RVAR];
                                        }
                                        // Set bound variables
                                        vLet(item);
                                        vIx(ix);
                                        vPv(prItem);
                                        vNx(nxItem);

                                        // Build
                                        await b(sub);

                                        if (bRe && !chR.subs)
                                            // Subscribe the range to the new RVAR_Light
                                            (item as RVAR_Light<Item>).Subscribe(
                                                chR.subs = Subscriber(sub, b, chR.ch)
                                            );
                                    }
                                    finally { ES() }
                                }

                                prItem = item;
                            }
                            if (prvR) prvR.nx = N; else r.ch = N;
                        };

                    if (iter instanceof Promise) {
                        let subEnv = {env, on};
                        r.rvars = [
                            RVAR(N, iter)
                            .Subscribe(r.subs = 
                                ass(iter => (
                                    ({env, on} = subEnv),
                                    pIter(iter as Iterable<Item>)
                                ), {sAr: T})
                            )
                        ];
                    }
                    else
                        await pIter(iter);
                };
            });
        }
        else { 
            /* Iterate over multiple slot instances */
            let nm = atts.g('of', T, T).toUpperCase()
                , {S,dC} = this.CT.getCS(nm) ||
                    // Slot doesn't exist; it's probably a missing 'let'
                    thro(`Missing attribute [let]`);
            
            return this.Framed(
                async SS => {
                    let 
                        vIx = this.LVar(ixNm)
                        , DC = this.LCons([S])
                        , b = await this.CChilds(srcE)
                    
                    return b && async function FOREACH_Slot(ar: Area) {
                        let
                            {tmplts, env} = dC(),
                            {ES, sub} = SS(ar),
                            i = 0;
                        try {
                            for (let slotBldr of tmplts) {
                                vIx(i++);
                                DC([
                                    {nm, tmplts: [slotBldr], env} as ConstructDef
                                ]);
                                await b(sub);
                            }
                        }
                        finally { ES(); }
                    }
                }
            );
        }
    }

    private CSignat(eSignat: Element):  Signat {
        let S = new Signat(eSignat), s: Signat;
        for (let attr of eSignat.attributes) {
            if (S.RP) 
                throw `Rest parameter must be last`;
            let [,mode,rp,nm,opt] = /^(#|@|(\.\.\.)|_|)(.*?)(\?)?$/.exec(attr.name);
            if (mode != '_')
                S.Params.push(
                    { mode, nm
                    , pDf:
                        rp
                            ? () => E
                        : attr.value != '' 
                            ? mode ? this.CExpr(attr.value, attr.name) :  this.CText(attr.value, attr.name)
                        : opt && (/^on/.test(nm) ? _ => dU : dU)   // Unspecified default
                    });
            S.RP = rp && nm;
        }
        for (let eSlot of eSignat.children) {
            // Compile and register slot signature
            mapNm(S.Slots, s = this.CSignat(eSlot));
            // Check whether it's a content slot
            if (/^CONTENT/.test(s.nm)) {
                if (S.CSlot) throw 'Multiple content slots';
                S.CSlot = s;
            }
        }
        return S;
    }

    // Compile a <COMPONENT> definition
    private async CComponent(srcE: HTMLElement, atts: Atts): Promise<DOMBuilder> {

        let bRec = atts.gB('recursive'),
            {head, ws} = this
            // There may be multiple components, each having a signature and a definition
            , signats: Array<Signat> = []
            , CDefs: Array<ConstructDef> = []
            // When encapsulate is specified, then 'encaps' becomes a HTMLCollection that shall contain all encapsulated style definitions
            , encaps = atts.gB('encapsulate')
                && (this.head = srcE.ownerDocument.createDocumentFragment()).children
            , arr = Array.from(srcE.children) as Array<HTMLElement>
            , elmSign = arr.shift() || thro('Missing signature(s)')
            , eTmpl = arr.pop()
            , t = /^TEMPLATE(S)?$/.exec(eTmpl?.tagName) || thro('Missing template(s)');

        for (let elm of /^SIGNATURES?$/.test(elmSign.tagName) ? elmSign.children : [elmSign])
            signats.push(this.CSignat(elm));

        try {
            var DC = bRec && this.LCons(signats)
                , ES = this.SS()
                , b = this.ErrH(
                        await this.CIter(arr)
                        , srcE)
                , mapS = new Map<string, Signat>(mapI(signats, S => [S.nm, S]));

            for (let [nm, elm, body] of 
                t[1]
                ?   mapI(eTmpl.children, elm => 
                        <[string, HTMLElement, ParentNode]>[elm.tagName, elm, elm]
                    )
                :   [ 
                        <[string, HTMLElement, ParentNode]>[signats[0].nm, eTmpl, (eTmpl as HTMLTemplateElement).content]
                    ]
            ) {
                CDefs.push({
                    nm,
                    tmplts: [ await this.CTempl(
                        mapS.get(nm) || thro(`Template <${nm}> has no signature`)
                        , elm, F, U, body, encaps) ]
                });
                mapS.delete(nm);
            }

            // Check every signature now has a template
            for (let [nm] of mapS)
                throw `Signature <${nm}> has no template`;
        }
        finally { 
            ES();
            ass(this, {head, ws}); 
        }

        DC ||= this.LCons(signats);

        return async function COMP(ar: Area) {
            // C must be cloned, as it receives its own environment
            DC(CDefs.map(C => ({...C, env})));
            
            await b?.(ar);
        };
    }


    // Compile a construct template
    // Used: 1. when compiling a <COMPONENT> definition
    //       2. When compiling slot definitions inside a construct instance
    //       3. When compiling the contents of a construct instance
    private CTempl(
        S: Signat                   // The construct signature
        , srcE: HTMLElement         // Source element, for error messages
        , bIsSlot?: boolean         // When true, naming bound variables is compulsory
        , atts?: Atts
        , body: ParentNode = srcE
        , styles?: Iterable<Node>   // When supplied, use shadow-dom to encapsulate the output
    ): Promise<Template>
    {
        return this.Framed(async SS => {
            this.ws = this.rspc = WSpc.block;
            let
                myAtts = atts || new Atts(srcE),
                // Local variables to contain the attribute values.
                // Note that the attribute name 'nm' may be different from the variable name.
                lvars: Array<[string, LVar]> =
                    S.Params.map(
                        ({mode,nm}) => [nm, this.LVar((myAtts.g(nm) ?? myAtts.g(mode + nm, bIsSlot)) || nm)]
                    ),
                DC = ( !atts && myAtts.NoneLeft(),
                    this.LCons(S.Slots.values())
                    ),
                b  = await this.CIter(body.childNodes),
                tag = /^[A-Z].*-/.test(S.nm) ? S.nm : `rhtml-${S.nm}`;

            // Routine to instantiate the template
            return b && async function TEMPL(
                args: ArgSet                        // Arguments to the template
                , mSlots: Map<string, Template[]>   // Map of slot templates
                , env: Environment                 // Environment to be used for the slot templates
                , ar: Area
            ) {
                let {sub, ES} = SS(ar);
                // Set parameter values, with default when undefined
                lvars.forEach(([nm,lv], i) => {
                    let arg = args[nm];
                    lv(arg !== U ? arg : S.Params[i]?.pDf?.());
                })
                // Define all slot-constructs
                DC(mapI(S.Slots.keys()
                    , nm => (
                        {   nm
                            , tmplts: mSlots.get(nm) || E
                            , env //, Cnm
                        }
                    )
                ));

                if (styles) {
                    let {r: {node}, chAr, cr} = PrepElm(sub, tag), 
                        shadow = node.shadowRoot || node.attachShadow({mode: 'open'});
                    if (cr)
                        for (let style of styles)
                            shadow.appendChild(style.cloneNode(T));
                    
                    if (S.RP)
                        ApplyMod(node, {mt: MType.RestArgument, nm: N, depV: N}, args[S.RP], cr);
                    chAr.parN = shadow;
                    sub = chAr;
                }
                await b(sub).finally(ES);
            }
        }).catch(e => { throw ErrMsg(srcE, `<${S.nm}> template: `+e); });
    }


    private async CInstance(
        srcE: HTMLElement, atts: Atts,
        {S, dC}: {S: Signat, dC: DepE<ConstructDef>}
    ) {
        await S.task;
        let 
            {RP, CSlot} = S,
            slotE: HTMLElement, slot: Signat, nm: string, s: string,

            gArgs: Array<[string,Dep<unknown>,Dep<Handler>?]>
                = S.Params.map(
                    ({mode, nm, pDf}) =>
                        nm == RP    // Rest parameter?
                        ? ((mods: Modifier[]): [string,Dep<unknown>] => 
                                [   nm
                                ,   () => mods.map(M => ({M, v: M.depV()})) as RestParameter
                                ]
                            )(this.CAtts(atts))
                        : mode == '@'   // Two-way parameter?
                        ?   [   nm
                                , (s = atts.g(mode+nm),
                                    this.CExpr<unknown>(s, mode+nm)
                                )
                                , this.CTarget(s)
                            ]
                        :   [   nm
                            ,   this.CParam(atts, nm, !pDf)
                            ]

                ),
            SBldrs = new Map<string, Template[]>(
                mapI(S.Slots, ([nm]) => [nm, []])
            );

        for (let node of Array.from(srcE.children))
            if ((slot = S.Slots.get(nm = (slotE = (node as HTMLElement)).tagName))
                && slot != CSlot
                ) {
                SBldrs.get(nm).push(
                    await this.CTempl(slot, slotE, T)
                );
                srcE.removeChild(node);
            }
            
        if (CSlot)  // Content slot?
            SBldrs.get(CSlot.nm).push(
                await this.CTempl(CSlot, srcE, T, atts)
            );
        
        atts.NoneLeft();
        this.ws = WSpc.inline;

        return async function INST(this: RCompiler, ar: Area) {
            let {r, sub, cr} = PrepRng<ArgSet>(ar, srcE),
                sEnv = env,
                cdef = dC(),
                args = r.val ||= {};
            
            if (cdef) {  //Just in case of an async imported component where the client signature has less slots than the real signature
                ro = T;
                try {
                    for (let [nm, dG, dS] of gArgs) {
                        let v=dG?.();
                        if (dS && !cr)
                            (args[nm] as RVAR).V = v;
                        else
                            args[nm] = dS ? RVAR('', v, N, dS()) : v;
                    }
                }
                finally { ro = F; }
                try {
                    env = cdef.env;
                    for (let tmpl of cdef.tmplts) 
                        await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {env = sEnv}
            }
        }
    }

    private async CHTMLElm(srcE: HTMLElement, atts: Atts,
            dTag?: Dep<string>
        ) {
        // Remove trailing dots
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, ''),
            // Remember preceeding whitespace-mode
            preWs = this.ws
            // Whitespace-mode after this element
            , postWs: WSpc;

        if (this.setPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
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
        let mods = this.CAtts(atts)

        // Compile the given childnodes into a routine that builds the actual childnodes
            , childBldr = await this.CChilds(srcE);

        if (postWs)
            this.ws = postWs;

        // Now the runtime action
        // 're' is 2 when the routine is called because of a 'thisreactson' attribute.
        // In that case the childnodes should not be updated.
        return async function ELM(ar: Area, re: number) {
                let {r: {node}, chAr, cr} = 
                    PrepElm(
                        ar,
                        nm || dTag(), 
                        ar.srcN
                    );
                
                if (re!=2)
                    // Build / update childnodes
                    await childBldr?.(chAr);

                node.removeAttribute('class');
                if (node.hndlrs) {
                    for (let {evType, listener} of node.hndlrs)
                        node.removeEventListener(evType, listener);
                    node.hndlrs.length = 0;
                }
                ApplyMods(node, mods, cr);
            };
    }

    private CAtts(atts: Atts) { 
        let mods: Array<Modifier> = []
            , m: RegExpExecArray;
        function addM(mt: MType, nm: string, depV: Dep<unknown>){
            mods.push({mt, nm, depV});
        }

        for (let [nm, V] of atts)
            if (m = /(.*?)\.+$/.exec(nm))                       // Literal attributes
                addM(MType.Attr, nm, this.CText(V, nm));

            else if (m = /^on(.*?)\.*$/i.exec(nm))              // Event handlers
                addM(MType.Event, m[0],
                    this.AddErrH(this.CHandlr(nm, V))
                );
            else if (m = /^#class[:.](.*)$/.exec(nm))
                addM(MType.Class, m[1],
                    this.CExpr<boolean>(V, nm)
                );
            else if (m = /^(#)?style\.(.*)$/.exec(nm))
                addM(MType.Style, m[2],
                    m[1] ? this.CExpr<unknown>(V, nm) : this.CText(V, nm)
                );
            else if (nm == '+style')
                addM(MType.AddToStyle, nm,
                    this.CExpr<object>(V, nm)
                );
            else if (nm == "+class")
                addM(MType.AddToClassList, nm,
                    this.CExpr<object>(V, nm)
                );
            else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) { // #, *, !, !!, combinations of these, @ = #!, @@ = #!!
                let p = m[1]
                    , nm = altProps[m[2]] || m[2]
                    , dSet: Dep<Handler>;
                
                if (/[@#]/.test(p)) {
                    let dV = this.CExpr<Handler>(V, nm);
                    if (/^on/.test(nm))
                        addM(MType.Event, nm, this.AddErrH(dV as Dep<Handler>));
                    else
                        addM(MType.Prop, nm, dV);
                }

                if (p != '#') {
                    let dS = this.CTarget(V), 
                        cnm: string;    // Stores the properly capitalized version of 'nm'
                    dSet = () => {
                        let S = dS();
                        return function(this: HTMLElement) {
                            S(this[cnm ||= ChkNm(this, nm)])
                        }
                    }

                    if (/\*/.test(p))
                        addM(MType.oncreate, nm, dSet);
                    if (/\+/.test(p))
                        addM(MType.onupdate, nm, dSet);
                    if (/[@!]/.test(p))
                        addM(MType.Event, /!!|@@/.test(p) ? 'onchange' : 'oninput', 
                            dSet);
                } 
            }
            else if (m = /^\.\.\.(.*)/.exec(nm)) {
                if (V) throw 'A rest parameter cannot have a value';
                addM(MType.RestArgument, nm, this.CT.getLV(m[1]) );
            }
            else if (nm == 'src')
                addM(MType.Src, this.FilePath, this.CText(V, nm) );
            else
                addM(MType.Attr, nm, this.CText(V, nm) );
        
        atts.clear();
        return mods;
    }

    private rIS: RegExp;
    // Compile interpolated text.
    // When the text contains no expressions, .fx will contain the (fixed) text.
    private CText(text: string, nm?: string): Dep<string> & {fx?: string} {
        let 
            // Regular expression to recognize string interpolations, with or without dollar,
            // with support for two levels of nested braces,
            // were we also must take care to skip js strings possibly containing braces and escaped quotes.
            // Backquoted js strings containing js expressions containing backquoted strings might go wrong
            // (We can't use negative lookbehinds; Safari does not support them)
            f = (re:string) => 
`(?:\\{(?:\\{${re}\\}|[^])*?\\}\
|'(?:\\\\.|[^])*?'\
|"(?:\\\\.|[^])*?"\
|\`(?:\\\\[^]|\\\$\\{${re}}|[^])*?\`\
|/(?:\\\\.|[^])*?\
|[^])*?`
            , rIS = this.rIS ||= 
                new RegExp(
                    `(\\\\[\${])|\\\$${this.Settings.bDollarRequired ? '' : '?'}\\{(${f(f(f('[^]*?')))})\\}|\$`
                    , 'g'
                ),
            gens: Array< string | Dep<unknown> > = [],
            ws: WSpc = nm || this.Settings.bKeepWhiteSpace ? WSpc.preserve : this.ws
            , isTriv = T
            , lastIx = rIS.lastIndex = 0
            , m: RegExpExecArray;

        while (T)
            if (!(m = rIS.exec(text))[1]) {
                var fx = lastIx < m.index ? text.slice(lastIx, m.index) : N;
                if (fx) {
                    fx = fx.replace(/\\([${}\\])/g, '$1'); // Replace '\{' etc by '{'
                    if (ws < WSpc.preserve) {
                        fx = fx.replace(/[ \t\n\r]+/g, ' ');  // Reduce all whitespace to a single space
                        // We can't use \s for whitespace, because that includes nonbreakable space &nbsp;
                        if (ws <= WSpc.inlineSpc && !gens.length)
                            fx = fx.replace(/^ /,'');     // No initial whitespace
                        if (this.rspc && !m[2] && rIS.lastIndex == text.length)
                            fx = fx.replace(/ $/,'');     // No trailing whitespace
                    }
                    if (fx) gens.push( fx );  
                }
                if (lastIx == text.length)
                    break;
                if ((m[2]?.trim()))
                    isTriv =
                        !gens.push( this.CExpr<string>(m[2], nm, U, '{}') );
                    
                lastIx = rIS.lastIndex;
            }
        
        if (isTriv) {
            fx = (gens as Array<string>).join('');
            return ass(() => fx, {fx})
        } else
            return () => {
                let s = "";
                for (let g of gens)
                    s += typeof g == 'string' ? g : g() ?? '';                
                return s;
            }
    }

    // Compile a simple pattern (with wildcards ?, *, [] and capturing expressions) into a RegExp and a list of bound LVars
    private CPatt(patt:string, url?: boolean): {lvars: LVar[], regex: RegExp, url: boolean}
    {
        let reg = '', lvars: LVar[] = []
        
        // These are the subpatterns that are need converting; all remaining characters are literals and will be quoted when needed
        , regIS =
            /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\[^])|\[\^?(?:\\[^]|[^\\\]])*\]|$/g;

        while (regIS.lastIndex < patt.length) {
            let ix = regIS.lastIndex
                , m = regIS.exec(patt)
                , lits = patt.slice(ix, m.index);

            reg += // Quote 'lits' such that it can be literally included in a RegExp
                    lits.replace(/\W/g, s => '\\'+s)
                +   ( m[1]!=N       // A capturing group
                                    ? (lvars.push(this.LVar(m[1])), `(.*?)`)
                    : m[0] == '?'   ? '.'
                    : m[0] == '*'   ? '.*'
                    : m[2]          ? m[2] // An escaped character
                                    : m[0] // A character class or "\{"
                    );
        }

        return {lvars, regex: new RegExp(`^${reg}$`, 'i'), url}; 
    }

    private CParam<T = unknown>(atts: Atts, att: string, bReq?: booly): Dep<T> {
        let txt = atts.g(att);
        return (
            txt == N ? this.CAttExp<T>(atts, att, bReq)
            : /^on/.test(att) ? this.CHandlr(att, txt) as Dep<any>
            : this.CText(txt, att) as Dep<any>
        );
    }
    private CAttExp<T>(atts: Atts, att: string, bReq?: booly
        ) {
        return this.CExpr<T>(atts.g(att, bReq, T),att, U);
    }

    private CTarget<T = unknown>(expr: string): Dep<(t:T) => void>
    // Compiles an "assignment target" (or "LHS expression") into a routine that sets the value of this target
    {
        return this.Closure<(t:T) => void>(
            `return $=>(${expr})=$`
            , ` in assigment target "${expr}"`
            );
    }

    private CHandlr(nm: string, text: string): Dep<Handler> {
        return /^#/.test(nm) ? this.CExpr<Handler>(text, nm)
            : this.CExpr<Handler>(`function(event){${text}\n}`, nm, text)
    }
    private CExpr<T>(
        expr: string           // Expression to transform into a function
        , nm?: string             // To be inserted in an errormessage
        , src: string = expr    // Source expression
        , dlms: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
    ): Dep<T> {
        return (expr == N ? <null>expr  // when 'expr' is either null or undefined
            : this.Closure(
                `return(${expr}\n)`
                , '\nat ' + (nm ? `[${nm}]=` : '') + dlms[0] + Abbr(src) + dlms[1] // Error text
            )
        );
    }
    private CAttExpList<T>(atts: Atts, attNm: string, bReacts?: boolean): Dep<T[]> {
        let list = atts.g(attNm, F, T);
        if (list==N) return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars[nm] = N;
        return this.CExpr<T[]>(`[${list}\n]`, attNm);
    }

    Closure<T>(body: string, E: string = ''): Dep<T> {
        // See if the context can be abbreviated
        let {ct,lvMap: varM, d} = this.CT, n=d+1
        for (let m of body.matchAll(/\b[A-Z_$][A-Z0-9_$]*\b/gi)) {
            let k = varM.get(m[0]);
            if (k?.[0] < n) n = k[0];
        }
        if (n>d)
            ct = '';
        else {
            let p0 = d-n, p1 = p0
            while (n--)
                p1 = ct.indexOf(']', p1) + 1;
            ct = `[${ct.slice(0,p0)}${ct.slice(p1)}]`;
        }

        try {
            var f = Ev(US+
                    `(function(${ct}){${body}})`  // Expression evaluator
            ) as (env:Environment) => T;
            return function(this: HTMLElement) {
                    try { 
                        return f.call(this, env);
                    } 
                    catch (e) {throw e+E; } // Runtime error
                };
        }
        catch (e) {throw e+E; } // Compiletime error
    }

    // Converts an event handler into one that on error calls the 'onerror' handler,
    // and that calls the 'onsuccess' handler on success
    private AddErrH(dHndlr: Dep<Handler>): Dep<Handler> {
        return () => {
            let hndlr = dHndlr()
                , {e,s} = on;
            return (hndlr && (e||s)
                ? function hError(this: HTMLElement, ev: Event) {
                    try {
                        let a = hndlr.call(this,ev);
                        // When the handler returns a promise, the result is awaited for
                        return (a instanceof Promise
                            ? a.then(v => (s?.(ev),v), e)
                            : s?.(ev), a
                        );
                    }
                    catch (er) {
                        (e || thro)(er);
                    }
                }
                : hndlr
            );
        };
    }

    // Returns the normalized (absolute) form of URL 'src'.
    // Relative URLs are considered relative to this.FilePath.
    private GetURL(src: string) {
        return new URL(src, this.FilePath).href
    }
    // Returns the normalized form of URL 'src' without file name.
    private GetPath(src: string) {
        return this.GetURL(src).replace(/[^/]*$/, '');
    }

    // Fetches text from an URL
    FetchText(src: string): Promise<string> {
        return RFetch(this.GetURL(src)).then(r => r.text());
    }

    // Fetch an RHTML module, either from a <MODULE id> element within the current document,
    // or else from an external file
    async fetchModule(src: string): Promise<Iterable<ChildNode>> {
        let m = D.getElementById(src);
        if (!m) {
            // External
            let {head,body} = P.parseFromString(await this.FetchText(src), 'text/html') as Document,
                e = body.firstElementChild as HTMLElement;

            // If the file contains a <MODULE> element we will return its children.
            if (e?.tagName != 'MODULE')
                // If not, we return everything: the document head and body concatenated
                return concI(head.childNodes, body.childNodes);

            m = e;
        }
        else if (m.tagName != 'MODULE') 
            throw `'${src}' must be a <MODULE>`;
        return m.childNodes;
    }
}

// Class to manage the set of attributes of an HTML source element.
class Atts extends Map<string,string> {
    constructor(elm: HTMLElement) {
        super();
        for (let a of elm.attributes)
            if (!/^_/.test(a.name)) // Ignore attributes starting with '_'
                super.set(a.name, a.value);
    }

    // Get an attribute value, optionally with hash, and remove it from the set
    public g(
        nm: string,         // Name
        bReq?: booly,       // Is the attribute required
        bHash?: booly,      // Is an optional hashtag allowed
        bI?: booly          // If it is specified without value, should the attribute name be treated as its implicit value
    ) {
        let m = nm, v = super.get(m);
        if (v==N && bHash)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute [`+nm+`]`;
        return bI && v == '' ? nm : v;
    }

    // Get a compile-time boolean attribute value
    // If the attribute is specified without value, it is treated as "true".
    public gB(nm: string, df: boolean = F): boolean { 
        let v = this.g(nm),
            m = /^((false|no)|true|yes)?$/i.exec(v);
        return v == N ? df
            : m ? !m[2]
            : thro(`@${nm}: invalid value`);
    }

    // Check that there are no unrecognized attributes left!
    public NoneLeft() {
        super.delete('hidden'); // Hidden may be added to any construct, so it remains hidden until compiled
        if (this.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}

const
    // Property names to be replaced
    altProps = {
        "class": "className", 
        for: "htmlFor"
    }

    // Elements that trigger block mode; whitespace before/after is irrelevant
    , reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL|SELECT|TITLE)$/
    , reInline = /^(BUTTON|INPUT|IMG)$/     // Elements that trigger inline mode
    , reWS = /^[ \t\n\r]*$/                 // Just whitespace, non-breaking space U+00A0 excluded!

    // Capitalized propnames cache
    , Cnms: {[nm: string]: string} = {}

// Check whether object obj has a property named like attribute name nm, case insensitive,
// and returns the properly cased name; otherwise return nm.
// Results are cached in 'Cnms', regardless of 'obj'.
, ChkNm = (obj: object, nm: string): string => {
    let c=Cnms[nm], r: RegExp;
    if (!c) {
        c=nm;
        if (!(nm in obj)) {
            r = new RegExp(`^${nm}$`, 'i'); // (nm cannot contain special characters)
            for (let p in obj)
                if (r.test(p))
                    {c = p; break;}
        }
        Cnms[nm] = c;
    }
    return c;
}

, Abbr = (s: string, m: number=60) =>
    s.length > m ?
        s.slice(0, m - 3) + "..."
        : s

// Add an object 'o' having a name 'o.nm' to a map
, mapNm = <OT extends {nm: string}>(m: Map<string, OT>, o:OT) =>
    m.set(o.nm, o)

// Either add or delete a value to a map
, mapSet = <V>(m: Map<string, V>, nm: string, v:V) =>
    v!=N ? m.set(nm, v) : m.delete(nm)

, ErrMsg = (elm: HTMLElement, e: string='', maxL?: number): string =>
    e + `\nat ${Abbr(/<[^]*?(?=>)/.exec(elm.outerHTML)[0], maxL)}>`

, ErrAtt = (e: string, nm: string) =>
    thro(nm ? e + `\nat [${nm}]` : e)

, createErrNode = (msg: string) => {
    let e = D.createElement('div');
    ass(e.style, {color: 'crimson', fontFamily: 'sans-serif', fontSize: '10pt'});
    e.innerText = msg;
    return e;
}

, NoChilds = (srcE: HTMLElement) => {
    for (let node of srcE.childNodes)
        if ( node.nodeType == 1         //Node.ELEMENT_NODE
            || node.nodeType == 3       //Node.TEXT_NODE 
                && !reWS.test(node.nodeValue)
            )
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
}

, copySSheets = (S: Document, D: Document) => {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules) 
            DSheet.insertRule(rule.cssText);
    }
}

, ScrollToHash = () =>
    L.hash && setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6)
;

// Concatenate two iterables
function* concI<T>(R: Iterable<T>, S:Iterable<T>)  {
    for (let x of R) yield x;
    for (let x of S) yield x;
}
// Map an iterable to another iterable
function* mapI<A, B>(I: Iterable<A>, f: (a:A)=>B, c?: (a:A)=>booly): Iterable<B> {
    for (let x of I)
        if (!c || c(x))
            yield f(x);
}
// Iterate through the trimmed non-empty members of a comma-separated list
function* split(s: string) {
    if (s)
        for (let v of s.split(','))
            if (v = v.trim())
                yield v;
}
// Iterate through a range of numbers
export function* range(from: number, count?: number, step: number = 1) {
	if (count === U) {
		count = from;
		from = 0;
	}
	for (let i=0;i<count;i++)
		yield from + i * step;
}

export async function RFetch(input: RequestInfo, init?: RequestInit) {
    let rp = await fetch(input, init);
    if (!rp.ok)
        throw `${init?.method||'GET'} ${input} returned ${rp.status} ${rp.statusText}`;
    return rp;
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
            let U = new URL(this.v);
            mapSet(U.searchParams as any, fld, val);
            return U.href;
        }
        RVAR(fld: string, df?: string, nm: string = fld) {
            let rv = RVAR<string>(nm, N, N, v => this.query[fld] = v);
            this.Subscribe(_ => rv.V = this.query[fld] ?? df, T, T);
            return rv;
        }
    }
let
    R = new RCompiler(),
    DL = new DocLoc(),
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

// Define global constants
ass(
    G, {RVAR, range, reroute, RFetch}
);

// Initiate compilation
setTimeout(async () => {
    for (let src of <NodeListOf<HTMLElement>>D.querySelectorAll('*[rhtml],*[type=RHTML]'))
        await RCompile(src, Ev(`({${src.getAttribute('rhtml')||''}})`));
}, 0);