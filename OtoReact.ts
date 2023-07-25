/* The OtoReact framework
* Copyright 2022 Peter J. de Bruin (peter@peterdebruin.net)
* See https://otoreact.dev/
*/
const
    // Some abbreviations
    // Please forgive me for trying to minimize the library file size
    U = undefined, N = null, T = true, F = false, Q='', 
    E = [],     // Empty array, must remain empty
    W = window, D = document, L = location,
    G = <typeof globalThis>self,
        // Polyfill for globalThis
        //W.globalThis || ((W as any).globalThis = W.self)
    US = "'use strict';",

    // Default settings 
    dflts: Settings = {
        bShowErrors:    T,
        // The default basepattern is defined in RCompile.
        //basePattern:    '/',
        bAutoSubscribe: T,
        bAutoPointer:   T,
        preformatted:   E as string[],
        storePrefix:    "RVAR_",
        version:        1
    },
    
    // Some utilities
    P = new DOMParser(),
    Ev = eval,                  // Note: 'eval(txt)' could access variables from this file, while 'Ev(txt)' cannot.
    ass = Object.assign as
                <T extends Object>(obj: T, props: Object) => T,
    now = () => performance.now(),
    thro = (err: any) => {throw err},
    NO = () => new Object(null) as {}   // A null object is a (cheap) object without prototype
    ;

//if (G.R$) {alert(`OtoReact is loaded both from:\n  ${G.R$}\nand from:\n  ${import.meta.url}\nYour application may not function correctly.`); throw Q;}

// Type used for truthy / falsy values
type booly = boolean|string|number|object|null|undefined;

type Settings = Partial<{
    bTiming: boolean,
    bAbortOnError:  boolean,      // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    boolean,      // Show runtime errors as text in the DOM output
    bSubf:          boolean|2,      // Subfile. 2 is used for RHTML.
    basePattern:    string,
    bAutoSubscribe: boolean,
    bAutoPointer:   boolean,
    bAutoReroute:   boolean,
    bNoGlobals:     boolean,
    bDollarRequired: boolean,
    bKeepWhiteSpace: boolean,
    bKeepComments:  boolean,
    preformatted:   string[],
    storePrefix:    string,
    version:        number,
    headers:        HeadersInit,    // E.g. [['Cache-Control','no-cache']]
}>;

// Current whitespace mode of the compiler:
const enum WSpc {
    zero = 0,
    block = 1,      // We are in block mode; whitespace is irrelevant
    inlineSpc,      // We are in inline mode with trailing whitespace, so more whitespace can be skipped
    inline,         // We are in inline mode, whitespace is relevant
    preserve        // Preserve all whitespace
}

/* For any HTMLElement we create, we remember which event handlers have been added,
    So we can remove them when needed */
type hHTMLElement = HTMLElement & {b?: booly};

/* A 'DOMBuilder' is the semantics of a piece of RHTML.
    It can both build (construct, create) a new range of DOM within an Area, and update an earlier created range of DOM within that same Area.
    The created DOM is yielded in 'ar.r'.
    'bR' is: truthy when the DOMBuilder is called on behalf of a 'thisreactson' attribute on the current source node,
        false when called on behalf of a 'reacton' on the current node
*/
type DOMBuilder<RT = unknown> = ((ar: Area, bR?: boolean) => Promise<RT>) 
    & {
        auto?: string; // When defined, the DOMBuilder will create an RVAR that MIGHT need auto-subscribing.
        nm?: string;   // Name of the DOMBuilder
    };


/* An 'Area' is a (runtime) place to build or update a piece of DOM, with all required information a builder needs.
    Area's are transitory objects; discarded after the builders are finished
*/
type Area<RT = {}, T = true> = {
    r?: Range & RT | T,          // Existing piece of DOM
    // When falsy (undefined or null), the DOM has to be CREATED
    // When truthy (defined or true), the DOM has to be UPDATED

    parN: ParentNode;            // DOM parent node
    bfor?: ChildNode;     // DOM node before which new nodes are to be inserted

    /* When !r, i.e. when the DOM has to be created: */
    srcN?: HTMLElement;     // Optional source node to be replaced by the new DOM 
    parR?: Range;         // The new range shall either be the first child this parent range,
    prR?: Range;        // Or the next sibling of this previous range
}
/* An 'AreaR' is an Area 'ar' where 'ar.r' is a 'Range' or 'null', not just 'true' */

type AreaR<RT = object> = Area<RT, never>;

/* A RANGE object describe a (possibly empty) range of constructed DOM nodes, in relation to the source RHTML.
    It can either be a single DOM node, with child nodes described by a linked list of child-ranges,
    OR just a linked list of subranges.
    It is created by a builder, and contains all metadata needed for updating or destroying the DOM.
*/
class Range<NodeType extends ChildNode = ChildNode> {
    n: NodeType;     // Optional DOM node, in case this range corresponds to a single node
    
    ch: Range;         // Linked list of child ranges (null=empty)
    nx: Range;         // Next range in linked list

    parR?: Range;       // Parent range, only when both belong to the SAME DOM node
    parN?: false | Node;        // Parent node, only when this range has a DIFFERENT parent node than its parent range

    constructor(
        ar: Area,               // The constructor puts the new Range into this Area
        n?: NodeType,        // Optional DOM node
        public text?: string,   // Description, used only for comments
    ) {
        this.n = n;
        if (ar) {
            let {parR: p, prR: q} = ar;
            if (p && !p.n)
                // Set the parent range, only when that range isn't a DOM node
                this.parR = p;
            
            // Insert this range in a linked list, as indicated by 'ar'
            if (q) 
                q.nx = this;
            else if (p)
                p.ch = this;
        
            // Update the area, so the new range becomes its previous range
            ar.prR = this;
        }
    }

    toString() { return this.text || this.n?.nodeName; }

    // Get first childnode IN the range
    public get Fst(): ChildNode {
        if (this.parN == N) {
            let {n, ch} = <Range>this;
            while (!n && ch) {
                n = ch.Fst;
                ch = ch.nx;
            }
            return n;
        }
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
            if (r.n)
                yield r.n;
            else if (c = r.ch)
                do {
                    yield* Nodes(c);
                } while (c = c.nx)
        })(this)
    }

    bD?: Handler;   // Before destroy handler
    aD?: Handler;   // After destroy handler

    // For reactive elements
    subs?: Subscriber;      // Subscriber object created for this element instance
    rvars?: RVAR[];         // RVARs on which the element reacts


    // Erase the range, i.e., destroy all child ranges and remove all nodes.
    // The range itself remains a child of its parent range.
    // The parent node must be specified, or a falsy value when nodes need not be removed.
    erase(par: false | Node) {
        let {n, ch} = this;
        if (n && par) {
            // Remove the current node, only when 'par' is specified
            par.removeChild(n);
            par = N; // No need to remove child nodes of this node
        }
        this.ch = N;
        while (ch) {
            // Call a 'beforedestroy' handler
            ch.bD?.call(ch.n || par);

            // Remove range ch from any RVAR it is subscribed to
            ch.rvars?.forEach(rv =>
                rv._Subs.delete(ch.subs));

            // Destroy 'ch'
            ch.erase(ch.parN ?? par);

            // Call 'afterdestroy' handler
            ch.aD?.call(ch.n || par);

            ch = ch.nx;
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
type Environment =  [Environment?, ...unknown[] ] & {cl?: string[]};

// An Environment Key points to a value in an environment. It consists of a frame depth number and an index into that frame.
type EnvKey = {d: number, i: number};

// A CONTEXT keeps track at runtime of all visible local variables and constructs, and where they are stored
class Context {
    d: number;          // Depth = number of parent frames
    L: number;          // Length = number of positive (local variable) array elements
    M: number;          // Number of negative (construct) array elements
    ct: string;         // String of all visible variable names, to match against an environment

    // Mapping of visible lvar names to EnvKeys
    lvM: Map<string, EnvKey>
    // Mapping of visible construct names to their signature and EnvKey
    csM:  Map<string, {S:Signat, k: EnvKey}>;

    // Construct a new context, optionally based on an existing context.
    // When 'a' is truthy, the context is to be used for asynchronous compilation and a copy of the map is to be made.
    // With synchronous compilation, this is not needed because the maps will always be restored to their previous value.
    constructor(C?: Context, a?: booly) {
        ass(
            this,
            C || {
                d: 0, L: 0, M: 0, ct: Q,
                lvM: new Map(), csM: new Map()
            }
        );
        if (a && C) {
            this.lvM = new Map(this.lvM);
            this.csM = new Map(this.csM);
        }
    }

    // Return a routines that, given an environment matching the current context returns the value pointed to by EnvKey 'k'
    getV<T>(k: EnvKey): DepE<T> {
        if (k) {
            let D = this.d;
            return (e:Environment = env) => {
                let {d,i} = k;
                for(;d < D; d++)
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
        return this.getV(this.lvM.get(nm) || thro(`Unknown name '${nm}'`));
    }
    // For a construct name 'nm', return a routines that,
    // given an environment matching the current context,
    // returns both the signature and the ConstructDef named by 'nm'
    // Returns 'null' when unknown
    getCS(nm: string): {S: Signat, dC: DepE<ConstructDef>}
    {
        let SK = this.csM.get(nm);
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

export async function RCompile(srcN: hHTMLElement, setts?: Settings): Promise<void> {
    // if (!setts?.version) alert('version 0')
    if (srcN.isConnected && !srcN.b)   // No duplicate compilation
        try {
            srcN.b = T;   // No duplicate compilation
            let
                m = L.href.match(`^.*(${setts?.basePattern || '/'})`)
                , C = new RComp(
                    N
                    , L.origin + (DL.basepath = m ? new URL(m[0]).pathname.replace(/[^/]*$/, Q) : Q)
                    , setts
                );
            await C.Compile(srcN);

            // Initial build
            Jobs.add({Exec: async() => {
                srcN.innerHTML = Q;
                await C.Build({
                    parN: srcN.parentElement,
                    srcN,           // When srcN is a non-RHTML node (like <BODY>), then it will remain and will receive childnodes and attributes
                    bfor: srcN      // When it is an RHTML-construct, then new content will be inserted before it
                });
                ScrollToHash();
            }});
            DoUpdate();
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
const PrepRng = <RT>(
    ar: Area,         // Given area
    srcE?: HTMLElement,  // Source element, just for error messages
    text: string = Q,  // Optional text for error messages
    nWipe?: 1|2,    // 1=erase 'ar.r' when 'res' has changed; 2=erase always
    res?: any,      // Some result value to be remembered
) : {
    r: Range & Partial<RT>,     // The newly created or updated child range
    sub: Area,       // The new sub area
    cr: booly    // True when the sub-range has to be created
} =>
{
    let {parN, r} = ar as AreaR<{res?: unknown}>,
        sub: Area = {parN }
        , cr: boolean;
    if (cr = !r) {
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
    
    return {r, sub, cr} as {r: Range & RT, sub: Area, cr: booly};
}

/*  When creating, build a new range containing a new HTMLElement.
    When updating, return the the range created before.
    Also returns a subarea to build or update the elements childnodes. */
, PrepElm = <RT>(
    ar: Area, 
    tag: string
): {
    r: Range<HTMLElement> & RT    // Sub-range
    , sub: Area                    // Sub-area
    , cr: boolean                  // True when the sub-range is being created
} => {
    let r = ar.r as Range<HTMLElement> & RT,
        cr: boolean;
    if (cr = !r)
        r = new Range(ar,
                ar.srcN
                || ar.parN.insertBefore<HTMLElement>(D.createElement(tag), ar.bfor)
            ) as Range<HTMLElement> & RT;
    else
        ar.r = r.nx || T;

    nodeCnt++
    return { 
        r, 
        sub: {
            parN: pn = r.n, 
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
        r.n.data = data;
        ar.r = r.nx || T;
    }
    nodeCnt++;
}

    //, NewEnv  = () => [N] as Environment
,   dU: DepE<any>   = _ => U,               // Undefined dependent value
    dB: DOMBuilder  = async ()=>{},         // A dummy DOMBuilder
    // Child windows to be closed when the app is closed
    chWins  = new Set<Window>(),
    // Map of all Otoreact modules that are being fetched and compiled, so they won't be fetched and compiled again
    OMods   = new Map<string, Promise<[DOMBuilder, Context]>>();

// A subscriber to an RVAR<T> is either any routine on T (not having a property .T),
// or an updating routine to some area .ar, yielding a promise that has to be awaited for,
// because no two updating routines may run in parallel.
type Subscriber<T = unknown> = 
      ((t?: T) =>unknown)          & { T?: never; }
    | ((t: T) => Promise<unknown>) & { T: true; };

type ParentNode = HTMLElement|DocumentFragment;

type Handler = (ev:Event) => any;

// Inside a builder routine, a local variable is represented by a routine to set its value,
// having additional properties 'nm' with the variable name and 'i' with its index position in the environment 'env'
type LVar<T=unknown> = ((value?: T) => T) & {nm: string};

// Setting multiple LVars at once
function SetLVs(vars: Array<LVar>, data: Array<unknown>) {
    vars.forEach((v,i) => v(data[i]));
}

// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {
    mode: ''|'#'|'@'|'...' 
    , nm: string            // Name
    , rq: booly             // Truthy when required (= not optional)
    , pDf: Dep<unknown>     // Default value expression
};

// A SIGNATURE describes an RHTML user construct: a component or a slot
class Signat {
    constructor(
        public srcE: Element, RC: RComp     
    ){ 
        this.nm = srcE.tagName;
        for (let attr of srcE.attributes) {
            let [a,m,rp,dum,nm,on,q]
                = /^(#|@|(\.\.\.)|(_)|)((on)?.*?)(\?)?$/.exec(attr.name)
                , v = attr.value;
            if (!dum) {
                if (this.RP) 
                    throw `Rest parameter must be last`;
                if (!nm && !rp)
                    throw 'Empty parameter name';
                let pDf =
                    v   ? m ? RC.CExpr(v, a) : RC.CText(v, a)
                        : on && (() => dU)
                this.Pams.push(
                    { 
                        mode: (m as ''|'#'|'@'|'...'),
                        nm,
                        rq: !(q || pDf || rp),
                        pDf: m=='@' ? () => RVAR(Q, pDf?.()) : pDf
                    }
                );
                this.RP = rp && nm;
            }
        }

        let {ct} = RC.CT, s: Signat;
        RC.CT.ct = Q; // Slot parameter defaults may not refer to local variables
        try{
            for (let eSlot of srcE.children) {
                // Compile and register slot signature
                mapNm(this.Slots, s = new Signat(eSlot, RC));
                // Check whether it's a content slot
                if (/^CONTENT/.test(s.nm)) {
                    if (this.CSlot) throw 'Multiple content slots';
                    this.CSlot = s;
                }
            }
        }
        finally {RC.CT.ct = ct}
    }

    public nm: string;
    public Pams: Array<Parameter> = [];   // Parameters
    public RP: string;            // Rest parameter (is also in Params)
    public Slots = new Map<string, Signat>();
    public CSlot: Signat;    // Content slot (is also in Slots)

    // In case of a non-async <import>, details of the signature will initially be missing, and the compilation of instances shall await this promise for the signature to be completed
    public task: Promise<any>;              

    // Check whether an import signature is compatible with the real module signature
    IsCompat(sig: Signat): booly {
        if (sig) {
            let c:booly = T
                , mP = new Map(mapI(sig.Pams,p => [p.nm, p]))
                , p: Parameter;
            // All parameters in the import must be present in the module
            for (let {nm, rq} of this.Pams)
                if (c &&= p = mP.get(nm)) {
                    // When optional in the import, then also optional in the module
                    c &&= (rq || !p.rq);
                    mP.delete(nm);
                }
            // Any remaining module parameters must be optional
            for (let p of mP.values())
                c &&= !p.rq;

            // All slots in the import must be present in the module, and these module slots must be compatible with the import slots
            for (let [nm, slotSig] of this.Slots)
                c &&= sig.Slots.get(nm)?.IsCompat(slotSig);
            
            return c;
        }
    }
}

// A CONSTRUCTDEF is a concrete instance of a signature
type ConstructDef = {
    nm: string,         // Name of the construct
    tmps: Template[], // Template, or in case of a slot construct, possibly multiple templates
    env?: Environment,  // Environment at the point the template was defined
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
            let sNm = storeNm || // R.setts.storePrefix 
                    'RVAR_' + name
                , s = store.getItem(sNm);
            if (s)
                try { init = JSON.parse(s); }
                catch{}
            this.Subscribe(v => 
                store.setItem(sNm, JSON.stringify(v ?? N))
            );
        }
        init instanceof Promise ? 
            init.then( v => this.V = v,  oes.e)
            : (this.v = init)
    }
    // The value of the variable
    v: T;
    // Immediate subscribers
    private _Imm: Set<Subscriber<T>>;
    // Deferred subscribers
    _Subs = new Set<Subscriber<T>>();

    // Add a subscriber 's', when it is not null.
    // When 'bImm' is truthy, the subscriber will be called immediately when the RVAR is set dirty;
    // otherwise it will be called by the 'DoUpdate' loop.
    // When 'cr' is truthy, it will be called immediately at the moment of subscribing.
    Subscribe(s: Subscriber<T>, bImm?: boolean, cr?: boolean) {
        if (s) {
            if (cr)
                s(this.v);
            (bImm ? this._Imm ||= new Set<Subscriber<T>>()
                : this._Subs).add(s);
        }
        return this;
    }
    Unsubscribe(s: Subscriber<T>) {
        this._Imm?.delete(s);
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
                (this.v = U, 
                    t.then(v => this.V = v, oes.e)
                )
                : (this.V = t);
    }
    get Clear() {
        return () => 
            Jobs.has(this) || (this.V=U);
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to to set the value and mark the rvar as dirty, even when the value has not changed.
    get U() { 
        ro || this.SetDirty();  
        return this.v }
    set U(t: T) { this.v = t; this.SetDirty(); }

    public SetDirty() {
        this._Imm?.forEach(s => s(this.v));

        if (this._Subs.size) {
            Jobs.add(this);
            RUpd();
        }
    }

    public async Exec() {
        for (let subs of this._Subs)
            try { 
                let P = subs(this.V);
                // When this is a DOM subscriber
                if (subs.T)
                    // Then await its completion, so that no two DOM builders run together
                    await P;
            }
            catch (e) {    
                console.log(e = `ERROR: ` + Abbr(e,1000));
                alert(e);
            }
    }

    toString() {
        return this.v?.toString() ?? Q;
    }
}
export type RVAR<T = unknown> = _RVAR<T>;

export type RVAR_Light<T> = T & {
    Subscribe: (sub:Subscriber) => void;
    Exec: () => Promise<void>;
    Save: () => void;
    _Subs: Set<Subscriber>;
    _UpdTo?: Array<RVAR>;
    store?: any;
    readonly U?: T;
    readonly V?: T;
};

        
function Subs({parN, parR}: Area, b: DOMBuilder, r: Range, bR:boolean = false): Subscriber {
    let eon = {env, oes, pn};
    // A DOM subscriber is  a routine that restores the current environment and error/success handlers,
    // and runs a DOMBuilder
    return ass(
        () => (
                ({env, oes, pn} = eon),
                b({parN, parR, r: r||T}, bR)
        )
        // Assign property .T just to mark it as a DOMSubscriber
        , {T});
}

type OES = {
    e: Handler, s: Handler // onerror and onsuccess handlers
};
let    
/* Runtime data */
    env: Environment,       // Current runtime environment
    pn: ParentNode,         // Current html node
    oes: OES = {e: N, s: N},    // Current onerror and onsuccess handlers

    // Dirty variables, which can be either RVAR's or RVAR_Light or any async function
    Jobs = new Set< {Exec: () => Promise<void> } >(),

    hUpd: number,        // Handle to a scheduled update
    ro: boolean = F,    // True while evaluating element properties so RVAR's should not be set dirty

    upd = 0,       // Iteration count of the update loop; used to make sure a DOM element isn't updated twice in the same iteration
    nodeCnt = 0,      // Count of the number of nodes
    start: number,
    NoTime = <T>(prom: Promise<T>) => {
        // Just await for the given promise, but increment 'start' time with the time the promise has taken,
        // so that this time isn't counted for the calling (runtime) task.
        let t= now();
        return prom.finally(() => { start += now()-t; })
    },
    RUpd = () => {
        if (!env && !hUpd)
            hUpd = setTimeout(DoUpdate, 1);
    }
;

export async function DoUpdate() {
    hUpd = N;
    if (Jobs.size && !env) {
        env = E;
        nodeCnt = 0;
        let u0 = upd;
        start = now();
        while (Jobs.size) {
            let J = Jobs;
            Jobs = new Set();
            if (upd++ - u0 > 25)
            { alert('Infinite react-loop'); break; }
            for (let j of J)
                await j.Exec();
        }
        if (nodeCnt)
            R?.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
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

const RV_props = 
{
    // _subs: {get: function(this: RVAR_Light<unknown>){ this._Subs = new Set() }},
    V:  {get: function(this: RVAR_Light<unknown>) {return this}},
    U:  {get:
            function(this: RVAR_Light<unknown>) {
                if (!ro) {
                    Jobs.add(this);                                
                    this._UpdTo?.forEach(rv => rv.SetDirty());                                
                    RUpd();
                }
                return this;
            }
        },
    Exec: {value: _RVAR.prototype.Exec},
    Subscribe: {value: function(this: RVAR_Light<unknown>, sub: Subscriber) {
        this._Subs.add(sub)
    }},
}

function RVAR_Light<T>(
    t: T, 
    updTo?: Array<RVAR>,
): RVAR_Light<T> {
    if (!(t as RVAR_Light<T>)._Subs) {
        (t as RVAR_Light<T>)._Subs = new Set();        
        (t as RVAR_Light<T>)._UpdTo = updTo;
        Object.defineProperties(t, RV_props);
    }
    return (t as RVAR_Light<T>);
}

// Element modifiers
type CU = 0|1|2|3;  // 1 = apply on create; 2 = apply on update; 3 = both
type Modifier = {
    mt: MType,          // Modifier type
    nm?: string,         // Modifier name
    d: Dep<unknown>,    // Routine to compute the value
    cu: CU,             // on create/update
    ap?: booly,         // Truthy when auto-pointer should be handled
    fp?: string,        // File path, when needed

    c?: string,         // properly cased name
    isS?: booly,        // Truthy when the property type is string
}
// Modifier Types
const enum MType {
    Attr          // Set/update an attribute
    , Prop            // Set/update a property
    , StyleProp         // Set/update a style property
    , ClassNames       // Set/update multiple class names
    , Style       // Set/update multiple style propertues
    , SetProps    // Set/update multiple props
    , Src           // Set the src attribute, relative to the current source document, which need not be the current HTML document
    , Event         // Set/update an event handler
    
    // The following modifier types are set áfter element contents has been created/updated.
    , RestParam  // Apply multiple modifiers
    , exec      // Set an oncreate handler
    , AutoReroute
}
type RestArg = {ms: Modifier[], xs: unknown[]};
type ModifierData = { [k: number]: Set<string>|Hndlr};

function ApplyMods(
        r: Range<HTMLElement> & ModifierData        // ModifierData may store previous information
        , cr: boolean
        , ms: Modifier[]
        , k = 0                 // Index into ModifierData
        , xs?: unknown[]        // Optional modifier values (in case of a Rest argument)
        ): number {
    // Apply all modifiers: adding attributes, classes, styles, events
    ro= T;
    let 
        e = r.n
        , cu = cr ? 1 : 2
        , hc: booly = F
        , i = 0
        , H: Hndlr
        ;
    try {
        for (let M of ms) {
            if (M.cu & cu)
            {
                let nm = M.nm, x = xs ? xs[i] : M.d();
                /* Apply modifier 'M' with actual value 'x' to element 'e'. */
                switch (M.mt) {
                    case MType.Attr:
                        e.setAttribute(nm, x as string); 
                        break;

                    case MType.Prop:
                        // For string properties, make sure val is a string
                        if (M.isS ??= typeof e[
                            // And (in any case) determine properly cased name
                            M.c = ChkNm(e,
                                nm=='for' ? 'htmlFor'
                                : nm=='valueasnumber' && (e as HTMLInputElement).type == 'number'
                                        ? 'value' 
                                : nm)
                        ]=='string')
                            // replace null and undefined by the empty string
                            x = x==N ? Q : x.toString();
                        // Avoid unnecessary property assignments; they may have side effects
                        if (x !== e[nm=M.c])
                            e[nm] = x;
                        break;

                    case MType.Event:                        
                        // Set and remember new handler
                        if (cr) {
                            (H = r[k] = new Hndlr()).oes = oes;
                            e.addEventListener(nm, H.hndl.bind(H));
                        }
                        else
                            H = <Hndlr>r[k];
                            
                        H.h = x as Handler;

                        if (M.ap)
                            // Handle bAutoPointer
                            e.style.cursor = (hc ||= x && !(e as HTMLButtonElement).disabled) ? 'pointer' : Q;   
                        break;

                    case MType.Style:
                        // Set #style, which may either be a string value to be set as attribute,
                        // or an object whose entries are to be set as style properties
                        if (x)
                            typeof x == 'string'
                            ?   ((e.style as any) = x)
                            :   ass(e.style, x);
                                //for (let [nm,v] of Object.entries(x as Object))
                                //    e.style[nm] = v || v === 0 ? v : Q;
                        break;
                        
                    case MType.StyleProp:
                        // Set a specific style property.
                        // ChkNm finds the proper capitalization, and this is remembered in M.c,
                        // so that it needs to be done only once for each source line
                        e.style[
                            M.c ||= ChkNm(e.style, nm)
                        ] = x || x === 0 ? x : Q;
                            // Replaces false and undefined by the empty string (or by null),
                            // otherwise the browser would ignore the assignment without clearing a previous value
                        break;

                    case MType.Src:
                        // 'nm' may be "src" or "srcset".
                        // 'M.fp' is the URL of the source document.
                        // Each URL in attribute value 'x' is to be interpreted as relative to 'M.fp'.
                        e[nm] = (x as string).replace(
                            /([^, \t\f\r\n]+)((\s.*?)?(,|$))/g,
                            (_,u,r) => new URL(u, M.fp).href + r
                            );
                        break;

                    case MType.SetProps:
                        ass(e, x);
                        break;

                    case MType.ClassNames:
                        // Set or update a collection of class names, without disturbing classnames added by other routines
                        let 
                            p = <Set<string>>r[k]  // Previous set of classnames, possibly to be removed
                            , n = M.cu & 2 ? (r[k] = new Set<string>()) : N; // New set of classnames to remember, onl
                        function AC(C: string) {
                            // Add a class name
                            if (C) {
                                // If this name occured in the previous set p, then remove it from this set, so it won't be removed from the element
                                p?.delete(C)
                                    //Otherwise add it to the element
                                    || e.classList.add(C);
                                // And in both cases, add it to the new set
                                n?.add(C);
                            }
                        }
                        if (x)
                            switch (typeof x) {
                                case 'string':
                                    // Might be multiple names
                                    x.split(/\s+/).forEach(AC);
                                    break;
                                case 'object':
                                    if (Array.isArray(x)) 
                                        x.forEach(AC);
                                    else
                                        for (let [nm, b] of Object.entries(x))
                                            b && AC(nm);
                                    break;
                                default: throw `Invalid value`;
                            }
                        if (p)
                            for (let v of p)
                                e.classList.remove(v);
                        break;

                    case MType.RestParam:
                        if (x) 
                            k = ApplyMods(r, cr, (x as RestArg).ms, k, (x as RestArg).xs);
                        break;

                    case MType.exec:
                        (x as Handler).call(e);
                        break;

                    case MType.AutoReroute:
                        if ( 
                            // When the A-element has no 'onclick' handler or 'download' or 'target' attribute
                            !(e as HTMLAnchorElement).download
                            && !(e as HTMLAnchorElement).target
                            // and the (initial) href starts with the current basepath
                            && (e as HTMLAnchorElement).href.startsWith(L.origin + DL.basepath)
                        )
                            // Then we add the 'reroute' onclick-handler
                            e.addEventListener('click', reroute);
                }
            }
            i++; k++
        }
    }
    finally { ro = F; }
    return k;
}

// Object to supply DOM event handlers with error handling and 'this' binding.
// It allows the handler and onerror handlers to be updated without creating a new closure
// and without replacing the target element event listener.
class Hndlr {
    oes: OES;       // onerror and onsuccess handler
    h: Handler;     // User-defined handler

    hndl(ev: Event, ...r: any[]) {
            if (this.h)
                try {
                    var {e,s} = this.oes,
                        a = this.h.call(ev.currentTarget, ev, ...r);
                    // Mimic return value treatment of 'onevent' attribute/property
                    a === false && ev.preventDefault();

                    a instanceof Promise
                        // When the handler returns a promise, the result is awaited for before calling an onerror or onsuccess handler
                        ? a.then(_ => s?.(ev), e)
                        // Otherwise call an onsuccess handler
                        : s?.(ev);
                }
                catch (er) {
                    // Call onerror handler or retrow the error
                    (e || thro)(er);
                }        
    }
}

let iRC = 0        // Numbering of RComp instances
    , iStyle = 0;   // Numbering of local stylesheet classnames
class RComp {

    public num = iRC++;  // Rcompiler instance number, just for identification during debugging

    CT: Context         // Compile-time context

    private cRvars: {[nm: string]: booly}
         = NO(); //RVAR names that were named in a 'reacton' attribute, so they surely don't need auto-subscription

    private doc: Document;

    // During compilation: node to which all static stylesheets are moved
    public hd: HTMLHeadElement|DocumentFragment|ShadowRoot;

    // Source file path, used for interpreting relative URLs
    public FP: string;

    lscl: string[];     // Local static stylesheet classlist
    ndcl: number;       // Number of dynamic local classnames
 
    constructor(
        RC?: RComp,
        FP?: string,
        settings?: Settings,
        CT = RC?.CT,
    ) { 
        this.S   = {... RC ? RC.S : dflts, ...settings};
        this.FP  = FP || RC?.FP;
        this.doc = RC?.doc || D
        this.hd  = RC?.hd || this.doc.head;
        this.CT    = new Context(CT, T);
        this.lscl= RC?.lscl || E;
        this.ndcl = RC?.ndcl || 0;
    }
/*
    'Framed' compiles a range of RHTML within a new variable-frame.
    Its parameter 'Comp' is the actual compiling routine, which is executed in a modified context,
    and receives a parameter 'SF' to be used in the builder routine created by 'Comp' to
    convert the environment 'env' into a new frame, and that returns a routine 'EndFrame' to restore the precious environment
*/  
    private Framed<T>(
        Comp: (
            StartScope: (sub: Area, r?:Range & {env?:Environment}) => {sub: Area, EF: () => void }
        )=>Promise<T>
    ): Promise<T> {
        let {CT, rActs} = this
            , {ct,d,L,M} = CT
            , A = rActs.length
            , nf: booly = L - M;
        // When the current frame is empty, we don't need a new one
        if (nf) {
            // Modify the context to account for the new frame
            CT.ct = `[${ct}]`;
            CT.d++;
            CT.L = CT.M = 0;
        }

        return Comp(
            // 'StartFrame' routine
            (sub, r?) => {
                // A new frame requires a range object, so that on updates we can restore the frame created earlier.
                // We can use a range provided by the caller, or prepare a new one
                let e = env;
                r || ({r,sub} = PrepRng<{v:Environment}>(sub));
                (env = r.env) || ((env = r.env = <Environment>[nf ? e : e[0]]).cl = e.cl);
                
                return {sub, EF: () => {env = e;} }; // 'EndFrame' routine
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
    private LV<T>(nm: string): LVar<T> {
        if (nm = nm?.trim())
        {
                try {
                    // Check valid JavaScript identifier
                    if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm))
                        throw N;
                    // Check for reserved keywords
                    Ev(`let ${nm}=0`); 
                }
                catch { throw `Invalid identifier '${nm}'`; }
            
            let {CT} = this
                , i = ++CT.L        // Reserve a place in the environment
                , vM = CT.lvM
                , p = vM.get(nm);    // If another variable with the same name was visible, remember its key

            // Set the key for the new variable
            vM.set(nm , {d: CT.d, i});

            // Register a routine to restore the previous key, at the end of the current scope
            this.rActs.push(() => mapSet(vM,nm,p));

            // Add the name to the context string, after removing a previous occurence of that name
            CT.ct = CT.ct.replace(new RegExp(`\\b${nm}\\b`), Q) 
                    + ',' + nm;

            // The routine to set the value
            var lv = (v => env[i] = v ) as LVar<T>
        }
        else
            // An empty variable name results in a dummy LVar
            lv = dU as any;
        lv.nm = nm; // Attach the name of the Lvar to the routine
        return lv;        
    }
    // Declare an number of LVar's, according to a comma-separated 'varList'.
    // Returns an array of LVar setters.
    private LVars(varlist: string): Array<LVar> {
        return Array.from(split(varlist), nm => this.LV(nm));
    }

    // At compiletime, declare a number of local constructs, according to the supplied signatures.
    // Returns a single routine to set them all at once.
    private LCons(listS: Iterable<Signat>) {
        let {CT} = this
            , {csM: cM, M, d}= CT;

        for (let S of listS) {
            let m = S.nm, p = cM.get(m);
            cM.set(m, {S, k: {d, i: --CT.M}});
            this.rActs.push(() => mapSet(cM,m,p));
        }

        return (CDefs: Iterable<ConstructDef>) => {
            let i = M;
            for (let C of CDefs)
                env[--i] = C;
        }
    }

    // Routine to execute any DOMBuilder with the document head as parent node
    private InHead<T>(b: DOMBuilder<T>) {
        return async(ar: Area) => {
            let {parN, bfor} = ar
                , p: Range;
            ass(ar, {parN: this.hd, bfor: N});
            try {
                return await b(ar);
            }
            finally {
                if (p = ar.prR) p.parN = ar.parN;  // Allow the created range to be erased when needed
                ass(ar, {parN, bfor});
            }
        }
    }

    // Compile a source tree into an ElmBuilder
    public async Compile(
        elm: ParentNode, 
        nodes?: Iterable<ChildNode>,  // Compile the element itself, or just its childnodes
    ) {
        for (let tag of this.S.preformatted)
            this.sPRE.add(tag.toUpperCase());
        this.srcCnt = 0;
        //this.log('Compile');
        let t0 = now(),
            b =
            ( nodes
            ? await this.CIter(nodes)
            : await this.CElm(elm as HTMLElement, T)
            ) || dB;
        this.log(`Compiled ${this.srcCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
        return this.bldr = b;
    }

    log(msg: string) {
        if (this.S.bTiming)
            console.log(new Date().toISOString().substring(11)+` ${this.num}: `+msg);
    }

    private sPRE = new Set(['PRE']);        // Elements needing whitespace to be preserved

    public async Build(ar: Area) {
        R = this;
        env = [];
        try {
            await this.bldr(ar);
        }
        finally {
            env = U;
        }
        await DoUpdate();
    }

    public S: Settings;
    public bldr: DOMBuilder;

    private ws = WSpc.block;  // While compiling: whitespace mode for the node(s) to be compiled; see enum WSpc
    private rt: booly = T;     // While compiling: may the generated DOM output be right-trimmed

    private srcCnt: number;   // To check for empty Content

    private CChilds(
        PN: ParentNode,
        nodes: Iterable<ChildNode> = PN.childNodes,
    ): Promise<DOMBuilder> {
        let ES = this.SS(); // Start scope
        return this.CIter(nodes).finally(ES)
    }

    // Compile some stretch of childnodes
    private async CIter(iter: Iterable<ChildNode>): Promise<DOMBuilder> {
        let {rt} = this     // Indicates whether the output may be right-trimmed
            , arr = Array.from(iter);
        while(rt && arr.length && reWS.test(arr[arr.length - 1]?.nodeValue)) 
            arr.pop();
        
        let bldrs = await this.CArr(arr, this.rt), l=bldrs.length;

        return !l ? N
            : l > 1 ? async function Iter(ar: Area)
                {   
                    for (let b of bldrs)
                        await b(ar);
                }
            : bldrs[0];
    }

    private async CArr(arr: Array<ChildNode>, rt: booly, i=0) : Promise<DOMBuilder[]> {
        let bldrs = [] as Array< DOMBuilder >
            , L = arr.length
            , rv: string
        while (i<L) {
            let srcN = arr[i++], bl: DOMBuilder;
            this.rt = i==L && rt;
            switch (srcN.nodeType) {
                
                case 1:         //Node.ELEMENT_NODE:
                    this.srcCnt ++;

                    if (rv = (bl = await this.CElm(srcN as HTMLElement))?.auto)
                        // Handle auto-subscription
                        try {
                            // Check for compile-time subscribers
                            bldrs.push(bl);

                            var 
                                gv = this.CT.getLV(rv) as DepE<RVAR> // Routine to get the rvar
                                // Compile remaining nodes, but first set this.cRvars[rv] to something truthy
                                , s = this.cRvars[rv]    // Save previous value
                                , bs = await this.CArr(arr, rt, this.cRvars[rv] =  i)
                                ;

                            // Were there no compile-time reacts for this rvar?
                            bl = bs.length && this.cRvars[rv]
                                ? async function Auto(ar: Area) {
                                        let {r, sub, cr} = PrepRng<{upd: number}>(ar);
                                        if (cr) {
                                            let rvar = gv(), s = rvar._Subs.size;
                                            for (let b of bs)
                                                await b(sub);
                                            if (rvar._Subs.size==s) // No new subscribers still?
                                                // Then auto-subscribe with the correct range
                                                rvar.Subscribe(
                                                    Subs(ar, Auto, r)
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
                    this.srcCnt ++;
                    let str = srcN.nodeValue
                        , getText = this.CText( str ), {fx} = getText;
                    if (fx !== Q) { // Either nonempty or undefined
                        bl = async (ar: Area) => PrepData(ar, getText());
                        
                        // Update the compiler whitespace mode
                        if (this.ws < WSpc.preserve)
                            this.ws = / $/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    break;

                case 8:         //Node.COMMENT_NODE:
                    if (this.S.bKeepComments) {
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
    private async CElm(srcE: HTMLElement, bUH?: boolean
        ): Promise<DOMBuilder> {       
        try {
            let 
                tag = srcE.tagName
                // List of source attributes, to check for unrecognized attributes
                , ats =  new Atts(srcE)
                , AL = this.rActs.length

                // Global attributes (this)react(s)on / hash / if / renew handlers,
                // to be compiled after the the element itself has been compiled
                , ga: Array<{att: string, m: RegExpExecArray, dV: Dep<RVAR[] | unknown[] | booly>}> = []

                // Generic pseudo-event handlers to be handled at runtime BEFORE and AFTER building
                , bf: Array<{att: string, txt: string, h?: Dep<Handler>, C: boolean, U: boolean, D: boolean}> = []
                , af: Array<{att: string, txt: string, h?: Dep<Handler>, C: boolean, U: boolean, D: boolean}> = []
                                
                // The intermediate builder will be put here
                , bl: DOMBuilder
                
                , auto: string  // rvar-name that might need auto-subscription

                // See if this node is a user-defined construct (component or slot) instance
                , constr = this.CT.getCS(tag)

                // Pre-declared variables for various purposes
                , b: DOMBuilder
                , m: RegExpExecArray
                , nm: string;

                // Check for generic attributes
            for (let [att] of ats)
                if (m = 
/^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(?:create|update|destroy|compile)+)$/
//     123                4       56                7      8              9          
                     .exec(att))
                    if (m[1])       // (?:this)?reacts?on|on
                        m[4] && tag!='REACT'    // 'on' is only for <REACT>
                        || m[7] && tag=='FOR'   // <FOR> has its own 'hash'
                        // other cases are put in the list:
                        ||  ga.push(
                                {
                                    att, 
                                    m, 
                                    dV: 
                                        m[5]  // on((error)|success)
                                            ? this.CHandlr(ats.g(att), att)
                                        : m[8] // if
                                            ? this.CAttExp(ats, att)
                                        :   // reacton, hash
                                          this.CAttExpList<RVAR>(ats, att, T)
                                });
                    else { 
                        let txt = ats.g(att);
                        if (/cr|d/.test(att))  // #?(before|after|on)(create|update|destroy|compile)+
                            // We have a pseudo-event
                            (m[9] ? bf : af)    // Is it before or after
                            .push({
                                att, 
                                txt, 
                                C: /cr/.test(att),    // 'att' contains 'create'
                                U: /u/.test(att),    // 'att' contains 'update'
                                D: /y/.test(att),    // 'att' contains 'destroy'
                                // 'before' events are compiled now, before the element is compiled
                                h: m[9] && this.CHandlr(txt, att)
                                // 'after' events are compiled after the element has been compiled, so they may
                                // refer to local variables introduced by the element.
                            });
                        if (/m/.test(att))    // oncompile
                            // Execute now, with 'srcE' as 'this'
                            Ev(`(function(){${txt}\n})`).call(srcE);
                    }

            if (constr)
                bl = await this.CInstance(srcE, ats, constr);
            else
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE': {
                        NoChilds(srcE);
                        let rv      = ats.g('rvar'), // An RVAR
                            t = '@value', 
                            twv     = rv && ats.g(t),
                            dGet    = twv ? this.CExpr(twv,t) : this.CPam(ats, 'value'),
                            bUpd    = ats.gB('reacting') || ats.gB('updating') || twv,

                            // When we want a two-way rvar, we need a routine to update the source expression
                            dSet    = twv && this.CTarget(twv),
                            dUpd    = rv   && this.CAttExp<RVAR>(ats, 'updates'),
                            dSto    = rv   && this.CAttExp<Store>(ats, 'store'),
                            dSNm    = dSto && this.CPam<string>(ats, 'storename'),
                            vLet    = this.LV(rv || ats.g('let') || ats.g('var', T)),
                            vGet    = rv && this.CT.getLV(rv) as DepE<RVAR>,
                            onMod   = rv && this.CPam<Handler>(ats, 'onmodified');

                        auto = rv && ats.gB('auto', this.S.bAutoSubscribe) && !onMod && rv; 
                        bl = async function DEF(ar, bR?) {
                                let r = ar.r
                                    , v: unknown, upd: RVAR;
                                // Evaluate the value only when:
                                // !r   : We are building the DOM
                                // bUpd : 'updating' was specified
                                // re:  : The routine is called because of a 'reacton' subscribtion
                                if (!r || bUpd || bR != N){
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
                        bl = await this.CCase(srcE, ats);
                    break;

                    case 'FOR':
                        bl = await this.CFor(srcE, ats);
                    break;

                    case 'MODULE': // Skip completely!
                        ats.g('id');
                        break;
                        
                    case 'INCLUDE':
                        bl = await this.CIncl(srcE, ats, T);
                    break;

                    case 'IMPORT': {
                        let src = ats.g('src', T)
                            , bIncl = ats.gB('include')
                            , bAsync = ats.gB('async')
                            , lvars: Array<LVar & {g?: DepE<unknown>}> 
                                        = this.LVars(ats.g('defines'))
                            , imps: Array<Signat & {g?: DepE<ConstructDef>}>
                                        = Array.from(mapI(srcE.children, ch => new Signat(ch, this)))
                            , DC = this.LCons(imps)
                            , cTask: Promise<[DOMBuilder, Context]>
                                = OMods.get(src)   // Check whether module has already been compiled
                            ;
                            
                        if (!cTask) {
                            // When the same module is imported at multiple places, it needs to be compiled only once
                            let C = new RComp(this, this.GetP(src), {bSubf: T}, new Context());
                            C.log(src);
                            cTask = 
                                this.fetchM(src)
                                .then(iter => C.Compile(N,iter))
                                .then(b => [b, C.CT]);
                            if (this.S.bSubf != 2)
                                OMods.set(src, cTask);
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
                        
                        if (!bAsync)
                            // Before an instance is compiled, the compiler should wait for the module
                            for (let sig of imps)
                                sig.task = task;
                        
                        bl = async function IMPORT(ar: Area) {
                            let {sub,cr,r} = PrepRng<{v:Environment}>(ar, srcE)
                            if (cr || bIncl) {
                                try {
                                    var b = await NoTime(task)
                                        , s = env
                                        , MEnv = env = r.v ||= []; // = NewEnv()
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
                        b = await this.CChilds(srcE);
                        bl = b && function REACT(sub: Area) { return b(PrepRng(sub, srcE).sub); }
                    break;

                    case 'RHTML': {
                        let 
                            {ws,rt} = this
                            , b = await this.CUncN(srcE)
                            , dSrc = !b && this.CPam<string>(ats, 'srctext')
                            , dO = this.CPam<Handler>(ats, "onç") // Undocumented feature
                            , s: Settings = {bSubf: 2, bTiming: this.S.bTiming}
                            ;
                       
                        bl = async function RHTML(ar) {
                            let 
                                {r, sub} = PrepElm<{pR: Range, src: string}>(ar, 'r-html')
                                , src = b ? (await b(sub)).innerText : dSrc?.()
                                ;

                            if (src != r.src) {
                                let 
                                    sv = env
                                    , C = ass( new RComp(N, L.origin+DL.basepath, s)
                                            , {ws,rt})
                                    , parN = C.hd = r.n.shadowRoot || r.n.attachShadow({mode: 'open'})
                                    , parR = r.pR ||= new Range(N, N, tag)
                                    , tmp = D.createElement(tag)
                                    ;

                                // This is just to allow imports from a module that is included in 'src'
                                // Modules are saved in OMod so they don't react on updates, though
                                (C.doc = D.createDocumentFragment() as Document).appendChild(tmp)

                                parR.erase(parN); 
                                parN.innerHTML = Q;

                                try {
                                    // Parsing
                                    tmp.innerHTML = r.src = src;
                                    // Compiling
                                    await C.Compile(tmp, tmp.childNodes);
                                    dO && dO()(U);
                                    // Building
                                    await C.Build({ parN, parR });
                                }
                                catch(e) { 
                                    parN.appendChild(crErrN(`Compile error: `+e))
                                }
                                finally { env = sv; }
                            }
                            pn = ar.parN;
                        };
                    } break;

                    case 'SCRIPT': 
                        bl = await this.CScript(srcE as HTMLScriptElement, ats); 
                        break;

                    case 'COMPONENT':
                        bl = await this.CComp(srcE, ats);
                        break;

                    case 'DOCUMENT': {
                        let vDoc = this.LV(ats.g('name', T)),
                            bEncaps = ats.gB('encapsulate'),
                            PC = this,
                            RC = new RComp(this),
                            vPams = RC.LVars(ats.g('params')),
                            vWin = RC.LV(ats.g('window',F,F,T)),
                            H = RC.hd = D.createDocumentFragment(),   //To store static stylesheets
                            b = await RC.CChilds(srcE);
                        bl = async function DOCUMENT(ar: Area) {
                            if (!ar.r) {
                                let {doc, hd} = PC,
                                    docEnv = env,
                                    wins = new Set<Window>();
                                vDoc({
                                    async render(w: Window, cr: boolean, args: unknown[]) {
                                        let s = env
                                            , Cdoc = RC.doc = w.document;
                                        RC.hd = Cdoc.head;
                                        env = docEnv;
                                        SetLVs(vPams, args);
                                        vWin(w);
                                        try {
                                            if (cr) {
                                                if (!bEncaps)
                                                    // Copy all style sheet rules of parent document
                                                    for (let SSh of (hd as ShadowRoot).styleSheets || doc.styleSheets) {
                                                        let DSh = Cdoc.head.appendChild(D.createElement('style')).sheet;
                                                        for (let rule of SSh.cssRules) 
                                                            DSh.insertRule(rule.cssText);
                                                    }
                                                // Copy static style sheets of document template
                                                for (let S of H.childNodes)
                                                    Cdoc.head.append(S.cloneNode(T));
                                            }
                                            
                                            await b({parN: Cdoc.body});
                                        }
                                        finally {env = s}
                                    },
                                    open(target?: string, features?: string, ...args: unknown[]) {
                                        let w = W.open(Q, target || Q, features)
                                            , cr = !chWins.has(w);
                                        if (cr) {
                                            w.addEventListener('keydown', 
                                                function(this: Window,event:KeyboardEvent) {if(event.key=='Escape') this.close();}
                                            );
                                            w.addEventListener('close', () => chWins.delete(w), wins.delete(w))
                                            chWins.add(w); wins.add(w);
                                        }
                                        w.document.body.innerHTML=Q // Just in case an existing target was used
                                        this.render(w, cr, args);
                                        return w;
                                    },
                                    async print(...args: unknown[]) {
                                        let f = doc.createElement('iframe');
                                        f.hidden = T;
                                        doc.body.appendChild(f);
                                        await this.render(f.contentWindow, T, args);
                                        f.contentWindow.print();
                                        f.remove();
                                    },
                                    closeAll: () =>
                                        wins.forEach(w => w.close())
                                });
                            }
                        }
                     } break;

                    case 'RHEAD':
                        let {ws} = this;
                        this.ws = this.rt = WSpc.block;
                        b = await this.CChilds(srcE);
                        this.ws = ws;
                        
                        bl = b && this.InHead(b);
                    break;

                    case 'STYLE': {
                        let src = ats.g('src'), sc = ats.g('scope')
                            , nm: string, {lscl: l, hd} = this;

                        if (sc) {
                            /^local$/i.test(sc) || thro('Invalid scope');
                            // Local scope
                            // Get a unique classname for this stylesheet
                            nm = `\uFFFE${iStyle++}`; // or e.g. \u0212

                            //bl = async function STYLE()

                            // Let all HTML elements in the current scope get this classname
                            this.lscl = [...l, nm];
                            // At the end of scope, restore
                            this.rActs.push(() => this.lscl = l);
                        }

                        (src ? this.FetchText(src) : Promise.resolve(srcE.innerText))
                            .then(txt => {
                                if (src || nm)
                                    srcE.innerHTML = AddC(txt, nm);
                                hd.appendChild(srcE);
                            });
                            
                        ats.clear();                        
                    } break;

                    case 'RSTYLE': {
                        let s: [boolean, RegExp, WSpc] = [this.S.bDollarRequired, this.rIS, this.ws]
                            , sc = ats.g('scope')
                            , {bf,af} = this.CAtts(ats)
                            , i: number
                        try {
                            this.S.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = WSpc.block;

                            let b = await (sc ?
                                ( /^local$/i.test(sc) || thro('Invalid scope')
                                , (i = this.ndcl++)
                                , this.rActs.push(() => this.ndcl--)
                                , this.CUncN(srcE, ats)
                                ) 
                                : this.CIncl(srcE, ats)
                            );

                            bl = b && async function RSTYLE(ar: Area) {
                                let 
                                    {r,cr,sub} = PrepElm<{cn: string, cl: string[], tx:string} & ModifierData>(ar, 'STYLE')
                                    , k = ApplyMods(r, cr, bf);

                                if (sc) {
                                    let txt = (await b(ar) as HTMLElement).innerText
                                        , nm =  r.cn ||= `\uFFFE${iStyle++}`;
                                
                                    if (txt != r.tx)
                                        // Set the style text
                                        // Would we set '.innerText', then <br> would be inserted
                                        r.n.innerHTML = AddC(r.tx = txt, nm);

                                    (env.cl = r.cl ||= [... env.cl||E])[i] = nm;
                                }
                                else
                                    await b(sub);

                                ApplyMods(r, cr, af, k);
                                pn = ar.parN;
                            }
                        }
                        finally {
                            [this.S.bDollarRequired, this.rIS, this.ws] = s;
                        }
                        break;
                    }
                    case 'ELEMENT':                        
                        bl = await this.CHTML(
                            srcE, ats
                            , this.CPam(ats, 'tagname', T)
                        );
                        this.ws = WSpc.inline;
                        break;

                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dN = this.CPam<string>(ats, 'name', T),
                            dV = this.CPam<string>(ats, 'value', T);
                        bl = async function ATTRIB(ar: Area){
                            let r = PrepRng<{v:string}>(ar, srcE).r
                                , n0 = r.v
                                , nm = r.v = dN();
                            if (n0 && nm != n0)
                                (pn as HTMLElement).removeAttribute(n0);
                            if (nm)
                                (pn as HTMLElement).setAttribute(nm, dV());
                        };
                        break;

                    case 'COMMENT': {
                        let {ws} = this,
                             b = (this.rt = F, this.ws = WSpc.preserve,
                                    await this.CUncN(srcE)
                             );
                        bl = async function COMMENT(ar:Area) {
                                PrepData(ar, 
                                    (await b(ar)).innerText
                                    , T);
                            };
                        this.ws = ws;
                    } break;
                    
                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        bl = await this.CHTML(srcE, ats, U, bUH);
                }
            
            if (!bUH)
                ats.None();
        
            // We are going to add pseudo-event and global attribute handling.
            // We keep the current builder function name, so we can attach it to the final builder.
            // And when the current builder 'bl' is empty, we replace it by the dummy builder, so the handler routines get
            // a non-empty builder.
            // When no handling is added, we'll make 'bl' empty again.
            
            nm = (bl ||= dB).name;

            // Add pseudo-event handling
            if (bf.length || af.length) {
                // Compile after-handlers now
                for (let g of af)
                    g.h = this.CHandlr(g.txt, g.att);

                let b = bl;
                bl = async function Pseu(ar: AreaR, bR) {                   
                    let {r, sub, cr} = PrepRng<{bU: Handler, aU: Handler}>(ar, srcE)
                        , sr = sub.r || T

                        , bD = ph(bf, 'bU', sr != T && sr.n || pn);

                    await b(sub, bR);

                    // We need the range created or updated by 'b'
                    // This is tricky. It requires that b creates at most one (peer) range
                    let rng = (cr
                            // When we are building, then 'b' has range sub.prR, if any
                            ? sub.prR
                            // When we are updating, then 'b' has a range when the current sub.r is different from sr, and sr is that range.
                            : sub.r != sr && <Range>sr
                        ) // When b doesn't have its own range, then we create one
                        || PrepRng(sub).r
                    
                        , aD = ph(af, 'aU', rng.n || pn);

                    if (cr)
                        ass(rng, {bD,aD});
                    
                    // Call or save before-handlers
                    function ph(hh: typeof bf, U: 'bU'|'aU', elm: Node): Handler {
                        if (cr) {
                            for (let g of hh) {
                                let h = g.h();
                                if (g.C)
                                    h.call(elm);
                                if (g.U)
                                    r[U] = h;
                                if (g.D)
                                    var D = h;    // Save a before-destroy handler, so we can assign it when a subrange has been created
                            }
                            return D;
                        }
                        // else
                        r[U]?.call(elm);
                    }
                }
            }

            // Compile global attributes
            for (let {att, m, dV} of this.S.version ? ga : ga.reverse()) {
                let b = bl
                    , es = m[6] ? 'e' : 's';  // onerror or onsuccess
                if (m[2]) { // (this)?reacts?on|(on)
                    let R =
                        async (ar: Area, bR?: boolean) => {
                            let {r, sub} = PrepRng<{upd: number}>(ar, srcE, att);

                            if (r.upd != upd)   // Avoid duplicate updates in the same RUpdate loop iteration
                                await b(sub, bR);
                            r.upd = upd;
                            return r;
                        }
                        , RE = this.ErrH(R, srcE)
                        , bTR = !!m[3]    // 'thisreactson'?
                        ;
                    bl = async function REACT(ar: Area, bR) {
                        let r = await R(ar, bR)
                            // Create a subscriber, or get the one created earlier
                            , s: Subscriber = r.subs ||= Subs(ar, RE, r, bTR)
                            // Remember previously subscribed rvars
                            , pv: RVAR[] = r.rvars   // 
                            , i = 0;

                        // Consider the currently provided rvars
                        for (let rvar of r.rvars = <RVAR[]>dV()) 
                            try {
                                if (pv) {
                                    // Check whether the current rvar(s) are the same as the previous one(s)
                                    let p = pv[i++];
                                    if (rvar==p)
                                        continue;           // Yes, continue with next
                                    p._Subs.delete(s);   // No, unsubscribe from the previous one
                                }
                                // Subscribe current rvar
                                rvar.Subscribe(s); }
                            catch { throw `This is not an RVAR\nat [${att}]`}
                    }
                }
                else
                    bl = 
                        m[5]  // set onerror or onsuccess
                        ? async function SetOnES(ar: Area, bR) {
                            let 
                                s = oes    // Remember current setting
                                , {sub, r} = PrepRng<{oes: object}>(ar, srcE, att);

                            // Create a copy. On updates, assign current values to the copy created before.
                            oes = ass(r.oes ||= <any>{}, oes);
                            try {
                                oes[es] = dV();     // Now set the new value
                                await b(sub, bR);   // Run the builder
                            }
                            finally { oes = s; }    // Restore current setting
                        }

                        : m[7]   // hash
                        ? function HASH(ar: Area, bR) {
                            let {sub, r,cr} = PrepRng<{v:unknown[]}>(ar, srcE, att)
                                , ph  = r.v;
                            r.v = <unknown[]>dV();
        
                            if (cr || r.v.some((hash, i) => hash !== ph[i]))
                                return b(sub, bR);
                        }
                        : m[8]  // #if
                        ?   function hIf(ar: Area, bR) {
                                let c = <booly>dV(),
                                    p = PrepRng(ar, srcE, att, 1, !c)
                                if (c)
                                    return b(p.sub, bR)
                            }
                        :   // Renew
                            function renew(sub: Area, bR) {
                                return b(
                                    PrepRng(sub, srcE, att, 2).sub
                                    , bR
                                );
                            }
            }

            return bl != dB && ass(
                this.ErrH(bl, srcE, this.rActs.length > AL)
                , {auto,nm}
                );
        }
        catch (m) { throw ErrM(srcE, m); }
    }

    private ErrH(b: DOMBuilder, srcN: ChildNode, bA?: booly): DOMBuilder{
        // Transform the given DOMBuilder into a DOMBuilder that handles errors by inserting the error message into the DOM tree,
        // unless an 'onerror' handler was given or the option 'bShowErrors' was disabled
        return b && (async (ar: AreaR<{eN: ChildNode}>, bR) => {
            let r = ar.r;
            if (r?.eN) {
                // Remove an earlier error message in the DOM tree at this point
                pn.removeChild(r.eN);
                r.eN = U;
            }
            try {
                await b(ar, bR);
            } 
            catch (m) { 
                let msg = 
                    srcN instanceof HTMLElement ? ErrM(srcN, m, 39) : m
                    , e = oes.e;

                if (bA || this.S.bAbortOnError)
                    throw msg;

                this.log(msg);
                e ? e(m)
                : this.S.bShowErrors ?
                    (r||{} as typeof r).eN = ar.parN.insertBefore(crErrN(msg), ar.r?.FstOrNxt)
                : U
            }
        });
    }

    private CIncl(srcE: HTMLElement, ats: Atts, bReq?: booly): Promise<DOMBuilder> {
        // Compile the contents of a node that may contain a 'src' attribute to include external source code
        let src = ats?.g('src', bReq);
        // When no ats were passed, or no src is present, or the node contains (server-side included) non-blank content,
        if (!src || srcE.children.length || srcE.textContent.trim())
            // then we compile just the child contents:
            return this.CChilds(srcE);
        // Otherwise we use a separate RComp object to asynchronously fetch and compile the external source code
        // We need a separate frame for local variables in this file, so that compilation of the main file can continue
        return this.Framed(async SF => {
            let C = new RComp(this, this.GetP(src), {bSubf: T})
                , task = 
                    this.fetchM(src)
                    // Parse the contents of the file, and compile the parsed contents of the file in the original context
                    .then(txt => C.Compile(N, txt))
                    .catch(e => {alert(e); throw e});

            return async function INCLUDE(ar) {
                    let {sub,EF} = SF(ar);
                    await (await NoTime(task))(sub).finally(EF);
                };
        }
        );
    }

    private async CUncN(srcE: HTMLElement, ats?: Atts): Promise<DOMBuilder<HTMLElement>> {
        // Compile the children of an "unconnected node", that won't be included in the output DOM tree, but that yields data for some other purpose (Comment, RSTYLE).
        // When 'ats' is provided, then a 'src' attribute is accepted.
        let b = await this.CIncl(srcE, ats);

        return b && (async (ar:Area) => {
            let {r, sub} = PrepRng<{p: HTMLElement}>(ar, srcE)
                , p = sub.parN = r.p ||= D.createElement(srcE.tagName);
            r.parN = F; sub.bfor = N;
            await b(sub);
            return p;
        });
    }

    private async CScript(srcE: HTMLScriptElement, ats: Atts) {
        let {type, text, defer, async} = srcE
            // External source?
            , src = ats.g('src')     // Niet srcE.src
            // Any variables to define?
            , defs = ats.g('defines')
            , varlist = [...split(defs)]
            // Is this a 'module' script (type=module or e.g. type="otoreact;type=module")?
            , bM = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type)
            // Is this a classic script?
            , bC = /^((text|application)\/javascript)?$/i.test(type)
            // Is this an ororeact script (local or static or global)
            , mO = /^otoreact(\/((local)|static))?\b/.exec(type)
            // True if a local script shpuld be re-executed at every update
            , bU = ats.gB('updating')
            // Current context string befóre NewVars
            , {ct} = this.CT
            // Local variables to be defined
            , lvars = mO && mO[2] && this.LVars(defs)
            // Placeholder to remember the variable values when !bUpd
            , exp: Array<unknown>
            // Routine to actually define the either local or global variables
            , SetV = lvars
                ? (e:unknown[]) => SetLVs(lvars, e)
                : (e:unknown[]) => varlist.forEach((nm,i) => G[nm] = e[i])
            ;
        
        ats.clear();   // No error on unknown attributes

        /* Script have to be handled by Otoreact in the following cases:
            * When it is a 'type=otoreact' script
            * Or when it is a classic or module script ánd we are in a subfile, so the browser doesn't automatically handle it */
        if (mO || (bC || bM) && this.S.bSubf) {
            if (mO?.[3]) {
                // otoreact/local script
                let prom = (async () => 
                    //this.Closure<unknown[]>(`{${src ? await this.FetchText(src) : text}\nreturn[${defs}]}`)
                    // Can't use 'this.Closure' because the context has changed when 'FetchText' has resolved.
                    Ev(US + `(function([${ct}]){{\n${src ? await this.FetchText(src) : text}\nreturn[${defs}]}})`
                    ) as DepE<unknown[]>
                    // The '\n' is needed in case 'text' ends with a comment without a newline.
                    // The additional braces are needed because otherwise, if 'text' defines an identifier that occurs also in 'ct',
                    // the compiler gives a SyntaxError: Identifier has already been declared
                    )();
                return async function LSCRIPT(ar: Area) {
                    if (!ar.r || bU)
                        SetV((await prom)(env));
                }
            } 
            else if (bM) {
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
                        SetV(
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
                let prom = (async() => `${mO ? US : Q}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    // Evaluate asynchronously as soon as the script is fetched
                    prom = prom.then(txt => void (exp = Ev(txt)));
                else if (!mO && !defer)
                    // Evaluate standard classic scripts without defer immediately
                    exp = Ev(await prom);

                return async function SCRIPT(ar: Area) {
                        !ar.r &&
                            SetV(exp ||= Ev(await prom));
                    };
            }
        }
    }

    private async CCase(srcE: HTMLElement, ats: Atts): Promise<DOMBuilder> {
        let bH = ats.gB('hiding'),
            dV = this.CAttExp<string>(ats, 'value'),
            cases: Array<{
                n: HTMLElement,
                ats: Atts,
                body?: Iterable<ChildNode>,
            }> = [],
            body: ChildNode[] = [];
        
        for (let n of srcE.childNodes) {
            if (n instanceof HTMLElement) 
                switch (n.tagName) {
                    case 'THEN':
                        var bThen = T;
                        new Atts(n as HTMLElement).None();
                        cases.push({n, ats});
                        continue;
                    case 'ELSE':
                    case 'WHEN':
                        cases.push({n, ats: new Atts(n as HTMLElement)});
                        continue;
                }
            body.push(n);
        }
        if (srcE.tagName == 'IF' && !bThen)
            cases.unshift({n: srcE, ats, body});

        let 
            caseList: Array<{
                cond?: Dep<booly>,
                not: boolean,
                patt?: {lvars: LVar[], RE: RegExp, url?: boolean},
                b: DOMBuilder, 
                n: HTMLElement,
            }> = [],
            {ws, rt, CT}= this,
            postCT = CT,
            postWs: WSpc = 0, // Highest whitespace mode to be reached after any alternative
            bE: booly;
        
        for (let {n, ats, body} of cases) {
            let ES = 
                ass(this, {ws, rt, CT: new Context(CT)})
                .SS();
            try {
                let cond: Dep<booly>, 
                    not: boolean = F,
                    patt:  {lvars: LVar[], RE: RegExp, url?: boolean},
                    p: string;
                switch (n.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp<booly>(ats, 'cond');
                        not = ats.gB('not');
                        patt = dV && (
                            (p = ats.g('match') ?? ats.g('pattern')) != N
                                ? this.CPatt(p)
                            : (p = ats.g('urlmatch')) != N
                                ? this.CPatt(p, T)
                            : (p = ats.g('regmatch') || ats.g('regexp')) != N
                                ?  {RE: new RegExp(p, 'i'), 
                                    lvars: this.LVars(ats.g('captures'))
                                }
                            : N
                        );

                        if (patt?.lvars.length && (bH || not))
                            throw `Pattern capturing can't be combined with 'hiding' or 'not'`;

                        // Fall through!

                    case 'ELSE':
                        caseList.push({
                            cond, not, patt
                            , b: await this.CChilds(n, body) || dB
                            , n
                        });
                        ats.None();
                        postWs = Math.max(postWs, this.ws);
                        postCT = postCT.max(this.CT);

                        bE ||= cond === U;  // Is there an ELSE
                }
            } 
            catch (m) { throw n.tagName=='IF' ? m : ErrM(n, m); }
            finally { ES(); }
        }
        this.ws = !bE && ws > postWs ? ws : postWs;
        this.CT = postCT;

        return caseList.length && async function CASE(ar: Area, bR) {
            let val = dV?.()
                , RRE: RegExpExecArray
                , cAlt: typeof caseList[0];
            try {
                // First determine which alternative is to be shown
                for (var alt of caseList)
                    if ( !(
                        (!alt.cond || alt.cond()) 
                        && (!alt.patt || val != N && (RRE = alt.patt.RE.exec(val)))
                        ) == alt.not)
                    { cAlt = alt; break }
            }
            catch (m) { throw alt.n.tagName=='IF' ? m : ErrM(alt.n, m); }
            finally {
                if (bH) {
                    // In this CASE variant, all subtrees are kept in place, some are hidden
                    for (let alt of caseList) {
                        let {r, sub, cr} = PrepElm(ar, 'WHEN');
                        if ( !(r.n.hidden = alt != cAlt) && !bR
                            || cr
                        )
                            await alt.b(sub);
                    }
                    pn = ar.parN;
                }
                else {
                    // This is the regular CASE  
                    let {sub, cr} = PrepRng(ar, srcE, Q, 1, cAlt);
                    if (cAlt && (cr || !bR)) {
                        if (RRE)
                            RRE.shift(),
                            SetLVs(
                                cAlt.patt.lvars,
                                cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE                                                
                            )

                        await cAlt.b(sub);
                    }
                }
            }
        }
    }


    private CFor(srcE: HTMLElement, ats: Atts): Promise<DOMBuilder> {

        // Three unknown but distinguished types, used by the <FOR> construct
        interface Item {}
        interface Key {}
        interface Hash {}        

        interface ForRange extends Range {
            pv?: ForRange;
            nx: ForRange;
            key?: Key;
            hash?: Hash; 
            moving?: booly;            
        }
        type ItemInfo = {item:Item, key: Key, hash:Hash[], ix: number};

        let letNm = ats.g('let')
            , ixNm = ats.g('index',F,F,T);
        this.rt = F;

        if (letNm != N) { /* A regular iteration */
            let dOf =
                this.CAttExp<Iterable<Item> | Promise<Iterable<Item>>>(ats, 'of', T)
                , pvNm = ats.g('previous',F,F,T)
                , nxNm = ats.g('next',F,F,T)
                , dUpd = this.CAttExp<RVAR>(ats, 'updates')
                , bRe: booly = ats.gB('reacting') || ats.gB('reactive') || dUpd;

            return this.Framed(async SF => {
                
                let             
                    // Add the loop-variable to the context, and keep a routine to set its value
                    vLet = this.LV(letNm),
                    // The same for 'index', 'previous' and 'next' variables
                    vIx = this.LV(ixNm),
                    vPv = this.LV(pvNm),
                    vNx = this.LV(nxNm),

                    dKey = this.CAttExp<Key>(ats, 'key'),
                    dHash = this.CAttExpList<Hash>(ats, 'hash'),

                    // Compile all childNodes
                    b = await this.CIter(srcE.childNodes);

                // Dit wordt de runtime routine voor het updaten:
                return b && async function FOR(ar: Area, bR) {
                    let 
                        {r, sub} = PrepRng<{v:Map<Key, ForRange>}>(ar, srcE, Q)
                        , {parN} = sub
                        , bfor = sub.bfor !== U ? sub.bfor : r.Nxt
                        , iter: Iterable<Item> | Promise<Iterable<Item>>
                            = dOf() || E
                        , sEnv = {env, oes}
                        , pIter = async (iter: Iterable<Item>) => {
                            ({env, oes} = sEnv);

                            // Check for being iterable
                            if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                                throw `[of] Value (${iter}) is not iterable`;

                            // Map of the current set of child ranges
                            let keyMap: Map<Key, ForRange> = r.v ||= new Map()

                            // Map of the newly obtained data
                                , nwMap = new Map<Key, ItemInfo>()

                            // First we fill nwMap, so we know which items have disappeared, and can look ahead to the next item.
                            // Note that a Map remembers the order in which items are added.
                                , ix=0
                                , {EF} = SF(N, <Range>{});
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

                                    nwMap.set(key ?? {}, {item, key, hash, ix: ix++});
                                }
                            }
                            finally { EF() }

                            // Now we will either create or re-order and update the DOM
                            let
                                L = nwMap.size, x: number
                                , nxR = <ForRange>r.ch    // This is a pointer into the created list of child ranges
                                , bf: ChildNode
                                , iter2 =  nwMap.values()
                                , nxIR = iter2.next()       // Next iteration result
                                , prIt: Item
                                , prR: Range
                                , k: Key
                                , E = ()=>{
                                    // Erase childranges at the current point with a key that is not in 'nwMap'
                                    while (nxR && !nwMap.has(k = nxR.key)) {
                                        if (k != N)
                                            keyMap.delete(k);
                                        nxR.erase(parN);
                                        if (nxR.subs)
                                            nxR.rvars[0]._Subs.delete(nxR.subs);
                                        nxR.pv = N;
                                        nxR = nxR.nx;
                                    }
                                    bf = nxR?.FstOrNxt || bfor;
                                }
                            sub.parR = r;
                            while(!nxIR.done) {
                                E();
                                // Inspect the next item
                                let {item, key, hash, ix} = <ItemInfo>nxIR.value
                                    // See if it already occured in the previous iteration
                                    , chR = keyMap.get(key)
                                    , cr = !chR
                                    , chAr: Area;

                                if (cr) {
                                    // Item has to be newly created
                                    sub.r = N;
                                    sub.prR = prR;
                                    sub.bfor = bf;
                                    ({r: chR, sub: chAr} = PrepRng(sub));
                                    if (key != N)
                                        keyMap.set(key, chR);
                                    chR.key = key;
                                }
                                else {
                                    // Item already occurs in the series; chR points to the respective child range
                                    while (nxR != chR)
                                    {
                                        if (!chR.moving) {
                                            // Item has to be moved; we use two methods
                                            if ( (x = nwMap.get(nxR.key).ix - ix) * x > L) {
                                                // Either mark the range at the current point to be moved later on, and continue looking
                                                nxR.moving = T;
                                                
                                                nxR = nxR.nx;
                                                E()
                                                continue;
                                            }
                                            // Or move the nodes corresponding to the new next item to the current point
                                            // First unlink:
                                            chR.pv.nx = chR.nx;
                                            if (chR.nx)
                                                chR.nx.pv = chR.pv;
                                        }
                                        // Move the range ofnodes
                                        for (let n of chR.Nodes())
                                            parN.insertBefore(n, bf);
                                        chR.moving = F;
                                        chR.nx = nxR;
                                        break;
                                    }

                                    nxR = chR.nx;
                                    sub.r = chR;

                                    // Prepare child range
                                    chAr = PrepRng(sub).sub;

                                    sub.parR = N;
                                }
                                chR.pv = prR;
                                chR.text = `${letNm}(${ix})`;

                                // Update pointers
                                if (prR) 
                                    prR.nx = chR;
                                else
                                    r.ch = chR;
                                prR = chR;

                                // Look ahead to next iteration result
                                nxIR = iter2.next();

                                // Does current range need building or updating?
                                if (cr ||
                                    !bR && (!hash || hash.some((h,i) => h != chR.hash[i]))
                                ) {
                                    chR.hash = hash;

                                    // Environment instellen
                                    let {sub, EF} = SF(chAr, chR);
                                    try {
                                        // Handle reactive loop variables
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
                                        vPv(prIt);
                                        vNx( (<ItemInfo>nxIR.value)?.item );

                                        // Build
                                        await b(sub);

                                        if (bRe && !chR.subs)
                                            // Subscribe the range to the new RVAR_Light
                                            (item as RVAR_Light<Item>).Subscribe(
                                                chR.subs = Subs(sub, b, chR.ch)
                                            );
                                    }
                                    finally { EF() }
                                }

                                prIt = item;
                            }
                            E();
                            if (prR) prR.nx = N; else r.ch = N;
                        };

                    if (iter instanceof Promise)
                        // The iteration is a Promise, so we can't execute the FOR just now, and we don't want to wait for it.
                        // So we create an RVAR that will receive the result of the promise, and that will execute the FOR.
                        r.rvars = [
                            RVAR(N, iter)
                            .Subscribe(r.subs = 
                                ass(pIter, {T} )       // Mark as a DOM subscriber
                            )
                        ];
                    else
                        await pIter(iter);
                };
            });
        }
        else { 
            /* Iterate over multiple slot instances */
            let nm = ats.g('of',T,T).toUpperCase()
                , {S,dC} = this.CT.getCS(nm) ||
                    // Slot doesn't exist; it's probably a missing 'let'
                    thro(`Missing attribute [let]`);
            
            return this.Framed(
                async SF => {
                    let 
                        vIx = this.LV(ixNm)
                        , DC = this.LCons([S])
                        , b = await this.CChilds(srcE)
                    
                    return b && async function FOREACH_Slot(ar: Area) {
                        let
                            {tmps, env} = dC(),
                            {EF, sub} = SF(ar),
                            i = 0;
                        try {
                            for (let slotBldr of tmps) {
                                vIx(i++);
                                DC([
                                    {nm, tmps: [slotBldr], env} as ConstructDef
                                ]);
                                await b(sub);
                            }
                        }
                        finally { EF(); }
                    }
                }
            );
        }
    }


    // Compile a <COMPONENT> definition
    private async CComp(srcE: HTMLElement, ats: Atts): Promise<DOMBuilder> {

        let bRec = ats.gB('recursive'),
            {hd, ws} = this
            , eStyles = ats.gB('encapsulate')
                // When encapsulation is requested, then eStyles becomes an HTMLCollection into which all static stylesheets are collected
                && (this.hd = D.createDocumentFragment()).children
            // These are all child elements
            , arr = Array.from(srcE.children) as Array<HTMLElement>
            // The first child element should be the signature
            , eSig = arr.shift() || thro('Missing signature(s)')
            // The last child element should be the template
            , eTem = arr.pop()
            // Check its tagName
            , t = /^TEMPLATE(S)?$/.exec(eTem?.tagName) || thro('Missing template(s)')
            // There may be multiple components, each having a signature and a definition
            , sigs: Array<Signat> = []
            , CDefs: Array<ConstructDef> = [];

        for (let elm of
                // When the first element is named SIGNATURE or SIGNATURES,
                /^SIGNATURES?$/.test(eSig.tagName) 
                // Then its children denote the actual signatures
                ? eSig.children 
                // Otherwise the element itself denotes the (single) component signature
                : [eSig]
                )
            sigs.push(new Signat(elm, this));

        try {
            var DC = bRec && this.LCons(sigs)
                , ES = this.SS()
                , b = this.ErrH(
                        await this.CIter(arr)
                        , srcE)
                , mapS = new Map<string, Signat>(mapI(sigs, S => [S.nm, S]));

            for (let [nm, elm, body] of 
                t[1]
                ?   mapI(eTem.children, elm => 
                        <[string, HTMLElement, ParentNode]>[elm.tagName, elm, elm]
                    )
                :   [ 
                        <[string, HTMLElement, ParentNode]>[sigs[0].nm, eTem, (eTem as HTMLTemplateElement).content]
                    ]
            ) {
                CDefs.push({
                    nm,
                    tmps: [ await this.CTempl(
                        mapS.get(nm) || thro(`Template <${nm}> has no signature`)
                        , elm, F, U, body, eStyles) ]
                });
                mapS.delete(nm);
            }

            // Check every signature now has a template
            for (let [nm] of mapS)
                throw `Signature <${nm}> has no template`;
        }
        finally { 
            ES();
            ass(this, {head: hd, ws}); 
        }

        DC ||= this.LCons(sigs);

        return async function COMP(ar: Area) {
            // At run time, C must be cloned, as it receives its own environment
            DC(CDefs.map(C => ({...C, env})));
            
            await b?.(ar);
        };
    }


    // Compile a construct template
    // Used: 1. when compiling a <COMPONENT> definition
    //       2. When compiling named slot definitions inside a construct instance
    //       3. When compiling the remaining content of a construct instance, to fill the content slot
    private CTempl(
        S: Signat                   // The construct signature
        , srcE: HTMLElement         // Source element, for error messages
        , bSlot?: boolean         // When true, naming bound variables is compulsory
        , ats?: Atts
        , body: ParentNode = srcE
        , eStyles?: Iterable<Node>   // When supplied, use shadow-dom to encapsulate the output and copy these style nodes
    ): Promise<Template>
    {
        return this.Framed(async SF => {
            this.ws = this.rt = WSpc.block;
            let
                myAtts = ats || new Atts(srcE),
                // Local variables to contain the attribute values.
                // Note that the attribute name 'nm' may be different from the variable name.
                lvars: Array<[string, LVar]> =
                    S.Pams.map(
                        ({mode,nm}) => {
                            let lnm = myAtts.g(nm) ?? myAtts.g(mode + nm);
                            return [nm, this.LV(lnm || (lnm === Q || !bSlot ? nm : N) )];
                        }
                    ),
                DC = ( !ats && myAtts.None(),
                    this.LCons(S.Slots.values())
                    ),
                b  = await this.CIter(body.childNodes),
                tag = // Is S.nm a valid custom element name?
                    /^[A-Z].*-/.test(S.nm) ? S.nm : 'rhtml-'+S.nm;

            // Routine to instantiate the template
            return b && async function TEMPL(
                args: ArgSet                        // Arguments to the template
                , mSlots: Map<string, Template[]>   // Map of slot templates
                , env: Environment                 // Environment to be used for the slot templates
                , ar: Area
            ) {
                // Handle defaults, in the constructdef environment,
                // using the default 
                if (!ar.r)
                    for (let {nm, pDf} of S.Pams)
                        if (pDf && args[nm] === U)
                            args[nm] =  pDf();
                
                ro = F;
                
                // Start frame
                let {sub, EF} = SF(ar);
                // Set parameter values
                for (let [nm,lv] of lvars)
                    lv(args[nm]);

                // Define all slot-constructs
                DC(mapI(S.Slots.keys()
                    , nm => (
                        {   nm
                            , tmps: mSlots.get(nm) || E
                            , env
                        }
                    )
                ));

                if (eStyles) {
                    let {r: {n}, sub: s, cr} = PrepElm(sub, tag), 
                        SR = s.parN = n.shadowRoot || n.attachShadow({mode: 'open'});
                    if (cr)
                        for (let sn of eStyles)
                            SR.appendChild(sn.cloneNode(T));
                    
                    sub = s;
                }
                await b(sub).finally(EF);
                pn = ar.parN;
            }
        }).catch(m => { throw ErrM(srcE, `<${S.nm}> template: `+m); });
    }

    // Compile a construct instance, given its signature and definition
    private async CInstance(
        srcE: HTMLElement, ats: Atts,
        {S, dC}: {S: Signat, dC: DepE<ConstructDef>}
    ) {
        await S.task;       // Wait for signature to be fetched (when sync imported)
        let 
            {RP, CSlot, Slots} = S,

            // Each specified parameter will be compiled into a triple containing:
            gArgs: Array<{
                nm: string,             // The parameter name
                dG: Dep<unknown>,       // A getter routine
                dS?: Dep<Handler>,      // A setter routine, in case of a two-way parameter
            }> = [],
            SBldrs = new Map<string, Template[]>(
                mapI(Slots, ([nm]) => [nm, []])
            );

        for (let {mode, nm, rq} of S.Pams)
            if (nm!=RP) {
                let dG: Dep<unknown>, dS: Dep<Handler>
                if (mode=='@') {
                    let ex = ats.g(mode+nm, rq);
                    dG = this.CExpr<unknown>(ex, mode+nm);
                    dS = this.CTarget(ex);
                }
                else
                    dG = this.CPam(ats, nm, rq);
                if (dG)
                    gArgs.push( {nm,dG,dS} );
            }

        let slotE: HTMLElement, slot: Signat, nm: string;
        for (let n of Array.from(srcE.children))
            if ((slot = Slots.get(nm = (slotE = (n as HTMLElement)).tagName))
                && slot != CSlot
            ) {
                SBldrs.get(nm).push(
                    await this.CTempl(slot, slotE, T)
                );
                srcE.removeChild(n);
            }
            
        if (CSlot)  // Content slot?
            SBldrs.get(CSlot.nm).push(
                await this.CTempl(CSlot, srcE, T, ats)
            );

        // Rest parameter?
        if (RP) {
            // Compile all remaining attributes into a getter for the rest parameter
            let {bf,af} = this.CAtts(ats);
            bf.push(...af); // Don't distinguish between before and after; everything goes after
            gArgs.push({
                nm: RP, 
                dG: () => <RestArg>{ms: bf, xs: bf.map(M => M.d())}
            });
        }
        
        this.ws = WSpc.inline;

        return async function INST(this: RComp, ar: Area) {
            let {r, sub} = PrepRng<{args: ArgSet}>(ar, srcE),
                sEnv = env,
                cdef = dC(),
                args = r.args ||= NO();
            
            if (cdef)  //Just in case of an async imported component where the client signature has less slots than the real signature
                try {
                    ro = T;
                    for (let {nm, dG, dS} of gArgs)
                        if (dS)
                            ( args[nm] ||= RVAR(U,U,U,dS()) ).v = dG();
                        else
                            args[nm] = dG();
                    
                    env = cdef.env;

                    for (let tmpl of cdef.tmps) 
                        await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {env = sEnv; ro = F;}
        }
    }

    private async CHTML(srcE: HTMLElement, ats: Atts
            , dTag?: Dep<string>    // Optional routine to compute the tag name
            , bUH?: booly           // Unhide after creation
    ) {
        // Compile a regular HTML element
        // Remove trailing dots
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, Q),
            // Remember preceeding whitespace-mode
            preWs = this.ws
            // Whitespace-mode after this element
            , postWs: WSpc;

        if (this.sPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
            this.ws = WSpc.preserve; postWs = WSpc.block;
        }
        else if (reBlock.test(nm))
            this.ws = this.rt = postWs = WSpc.block;
        
        else if (reInline.test(nm)) {  // Inline-block
            this.ws = this.rt = WSpc.block;
            postWs = WSpc.inline;
        }
        
        if (preWs == WSpc.preserve)
            postWs = preWs;

        // We turn each given attribute into a modifier on created elements
        let {bf,af} = this.CAtts(ats)

        // Compile the given childnodes into a routine that builds the actual childnodes
            , b = await this.CChilds(srcE)
            , {lscl,ndcl}= this  // List of scoping-classnames to be added to all instances of this source element

        if (postWs)
            this.ws = postWs;

        if (nm=='A' && this.S.bAutoReroute && bf.every(({nm}) => nm != 'click')) // Handle bAutoReroute
            af.push({mt: MType.AutoReroute, d: dU, cu : 1 });

        if (bUH)
            af.push({mt: MType.Prop, nm: 'hidden', d: dU, cu: 1});

        bf.length || (bf=U);
        af.length || (af=U);

        // Now the runtime action
        return async function ELM(ar: Area, bR: booly) {
                let {r, sub, cr} = 
                    PrepElm<ModifierData>(
                        ar,
                        nm || dTag()
                    )
                    , k = bf && ApplyMods(r, cr, bf);

                if (cr) {
                    // Add static local scoping classnames
                    for (let nm of lscl) r.n.classList.add(nm);
                    // Add dynamic local scoping classnames
                    for (let i=0; i<ndcl; i++)
                        r.n.classList.add(env.cl[i]);
                }
                
                if (cr || !bR)
                    // Build / update childnodes
                    await b?.(sub);
                
                af && ApplyMods(r, cr, af, k);

                pn = ar.parN;
            };
    }

    private CAtts(ats: Atts) {
        // Compile attributes into an array of modifiers

        let bf: Modifier[] = []
            , af: Modifier[] = []
            , m: RegExpExecArray
            , ap = this.S.bAutoPointer
            , addM =
            (mt: MType, nm: string
                , d: Dep<unknown> & {fx?: string}
                , cu?: CU  // Has this modifier to be executed on create / update / both
            ) => {
                let M: Modifier = 
                    {mt, nm, d
                        , cu: cu ||
                            // When the attribute value is a string constant, then it need only be set on create
                            (d.fx != N ? 1 : 3)
                    };
                if (ap && mt == MType.Event) M.ap = nm == 'click';
                if (mt == MType.Src) M.fp = this.FP;

                // Either the 'before' or 'after' list
                (mt < MType.RestParam && nm!='value' ? bf : af).push(M);
            };

        for (let [A, V] of ats)
            if (m = /^(?:(([#+.](#)?)?(((class|classname)|style)(?:[.:](\w+))?|on(\w+)\.*|(src|srcset)|(\w*)\.*))|([\*\+#!]+|@@?)(\w*)|\.\.\.(\w+))$/.exec(A)) 
            //           op     h-h p dyc---------------c     -y       i---id    e---e    s            a---a   -o t-           -tk---k       r---r
            {
                let [,o,p,h,d,y,c,i,e,s,a,t,k,r] = m;
                if (o) {
                    // One-way attributes/properties/handlers
                    let 
                        dV = p ? this.CExpr(V, A)
                            : e ? this.CHandlr(V, A)
                            : this.CText(V, A)
                    ;
                    
                    addM(
                        c ? MType.ClassNames
                        : y ? i ? MType.StyleProp : MType.Style
                        : e ? MType.Event
                        : s ? MType.Src
                        : p ? d ? MType.Prop : MType.SetProps
                        : MType.Attr

                        , a || e || i || d

                        , i && c 
                            ? () => Object.fromEntries([[i, dV()]]) // Treat '#class.name = V' like '#class = {name: V}'
                            : dV

                        // Undocumented feature: when the source attribute contains a DOUBLE hash,
                        // then the modifier is executed only on create
                        , (e && !p || h) && 1
                        );
                }
                else if (t) {
                    // Two-way properties
                    // #, ##, *, !, !!, combinations of these, @ = #!, @@ = #!!, @# = ##!, @@# = ##!!
                    let 
                        cu: CU                    
                        , dS = this.CTarget(V)
                        , cnm: string    // Stores the properly capitalized version of 'nm'
                        , dSet = () => {
                            let S = dS();
                            return k ? 
                                function(this: HTMLElement) { S(this[cnm ||= ChkNm(this, k)]); }
                            // Handle the attribute " *=target "
                                : function(this: HTMLElement) { S(this); }
                        };

                    if (m=/[@#](#)?/.exec(t))
                        addM(MType.Prop, k, this.CExpr<Handler>(V, k), m[1] && 1);

                    if (cu = <number><any>/\*/.test(t) + <number><any>/\+/.test(t) * 2 as CU)
                        addM(MType.exec, k, dSet, cu);

                    if (m=/([@!])(\1)?/.exec(t))
                        addM(MType.Event, m[2] ? 'change' : 'input', dSet, 1);
                }

                else //if (n) 
                {
                    // Rest parameter
                    if (V) throw 'A rest parameter cannot have a value';
                    addM(MType.RestParam, A, this.CT.getLV(r) );
                }
                ats.delete(A);
            }

        return {bf, af};
    }

    private rIS: RegExp;
    // Compile interpolated text.
    // When the text contains no expressions, .fx will contain the (fixed) text.
    CText(text: string, nm?: string): Dep<string> & {fx?: string} {
        let 
            // Regular expression to recognize string interpolations, with or without dollar,
            // with support for two levels of nested braces,
            // where we also must take care to skip js strings possibly containing braces,  escaped quotes, quoted strings, regexps, backquoted strings containing other expressions.
            // Backquoted js strings containing js expressions containing backquoted strings might go wrong
            // (We can't use negative lookbehinds; Safari does not support them)
            f = (re:string) => 
`(?:\\{(?:\\{${re}\\}|[^])*?\\}\
|'(?:\\\\.|[^])*?'\
|"(?:\\\\.|[^])*?"\
|\`(?:\\\\[^]|\\\$\\{${re}}|[^])*?\`\
|/(?:\\\\.|\[]?(?:\\\\.|.)*?\])*?/\
|[^])*?`
            , rIS = this.rIS ||= 
                new RegExp(
                    `\\\\([{}])|\\$${this.S.bDollarRequired ? Q : '?'}\\{(${f(f(f('[^]*?')))})\\}|$`
                    , 'g'
                ),
            gens: Array< string | Dep<unknown> > = [],
            ws: WSpc = nm || this.S.bKeepWhiteSpace ? WSpc.preserve : this.ws
            , fx = Q
            , iT: booly = T         // truthy when the text contains no nonempty embedded expressions
            ;

        rIS.lastIndex = 0
        while (T) {
            let lastIx = rIS.lastIndex, m = rIS.exec(text);
            // Add fixed text to 'fx':
            fx += text.slice(lastIx, m.index) + (m[1]||Q)
            // When we are either at the end of the string, or have a nonempty embedded expression:
            if (!m[0] || m[2]?.trim()) {
                if (ws < WSpc.preserve) {
                    // Whitespace reduction
                    fx = fx.replace(/[ \t\n\r]+/g, " ");  // Reduce all whitespace to a single space
                    // We can't use \s for whitespace, because that includes nonbreakable space &nbsp;
                    if (ws <= WSpc.inlineSpc && !gens.length)
                        fx = fx.replace(/^ /,Q);     // No initial whitespace
                    if (this.rt && !m[0])
                        fx = fx.replace(/ $/,Q);     // No trailing whitespace
                }
                if (fx) gens.push( fx );
                if (!m[0])
                    return iT ? ass(() => fx, {fx})
                        : () => {
                            let s = Q;
                            for (let g of gens)
                                s += typeof g == 'string' ? g : g() ?? Q;                
                            return s;
                        };
                
                gens.push( this.CExpr<string>(m[2], nm, U, '{}') );
                iT = fx = Q;
            }
        }
    }

    // Compile a simple pattern (with wildcards ?, *, [] and capturing expressions) into a RegExp and a list of bound LVars
    private CPatt(patt:string, url?: boolean): {lvars: LVar[], RE: RegExp, url: boolean}
    {
        let reg = Q, lvars: LVar[] = []
        
        // These are the subpatterns that are need converting; all remaining characters are literals and will be quoted when needed
        , rP =
            /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\[^])|\[\^?(?:\\[^]|[^\\\]])*\]|$/g;

        while (rP.lastIndex < patt.length) {
            let ix = rP.lastIndex
                , m = rP.exec(patt)
                , lits = patt.slice(ix, m.index);

            reg += // Quote 'lits' such that it can be literally included in a RegExp
                    lits.replace(/\W/g, s => '\\'+s)
                +   ( m[1]!=N       // A capturing group
                                    ? (lvars.push(this.LV(m[1])), '(.*?)')
                    : m[0] == '?'   ? '.'
                    : m[0] == '*'   ? '.*'
                    : m[2]          ? m[2] // An escaped character
                                    : m[0] // A character class or "\{"
                    );
        }

        return {lvars, RE: new RegExp(`^${reg}$`, 'i'), url}; 
    }

    private CPam<T = unknown>(ats: Atts, att: string, bReq?: booly): Dep<T> 
    // Compile parameter (of some OtoReact construct) 
    {
        let txt = ats.g(att);
        return (
            txt == N ? this.CAttExp<T>(ats, att, bReq)
            : /^on/.test(att) ? this.CHandlr(txt, att) as Dep<any>
            : this.CText(txt, att) as Dep<any>
        );
    }
    private CAttExp<T>(ats: Atts, att: string, bReq?: booly
        ) {
        return this.CExpr<T>(ats.g(att, bReq, T), att, U);
    }
    
    private CTarget<T = unknown>(LHS: string): Dep<(t:T) => void>
    // Compiles an "assignment target" (or "LHS expression") into a routine that sets the value of this target
    {   
        return this.CRout<T>(`(${LHS})=$` , '$', `\nin assigment target "${LHS}"`);
    }
    
    private CHandlr(
        txt: string
        , nm: string
    ): DepE<(v: Event) => any> {
        return /^#/.test(nm) ?
            this.CExpr(txt, nm, txt)
            : this.CRout(txt, 'event', `\nat [${nm}]="${Abbr(txt)}"`);

    }

    private CRout<V>(
        txt: string
        , x: string
        , E: string): DepE<(v: V) => any> {
            try {
                let ct = this.gsc(txt)
                    , C = Ev(`${US}(function(${x},${ct}){${txt}\n})`)
                return ct ? 
                    (e: Environment = env) =>
                        function($) {
                            try { C.call(this,$,e); }
                            catch(m) {throw m+E;}
                        }
                    : () => function($) {
                            try { C.call(this,$); }
                            catch(m) {throw m+E;}
                        };
            }
            catch (m) {throw m+E;}
    }

    public CExpr<T>(
        e: string           // Expression to transform into a function
        , nm?: string             // To be inserted in an errormessage
        , src: string = e    // Source expression
        , dl: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
    ): Dep<T> {
        if (e == N)
            return <null>e;  // when 'e' is either null or undefined
        
        if (!/\S/.test(e)) 
            throw `[${nm}] Empty expression`;
        
        try {
            var f = Ev(
                    `${US}(function(${this.gsc(e)}){return(${e}\n)})`  // Expression evaluator
                ) as (e:Environment) => T
                , E = '\nat ' + (nm ? `[${nm}]=` : Q) + dl[0] + Abbr(src) + dl[1] // Error text

            return () => {
                    try { 
                        return f.call(pn, env);
                    } 
                    catch (m) {throw m+E; } // Runtime error
                };
        }
        catch (m) {throw m+E; } // Compiletime error
    }

    private CAttExpList<T>(ats: Atts, attNm: string, bReacts?: boolean): Dep<T[]> {
        let L = ats.g(attNm, F, T);
        if (L==N) return N;
        if (bReacts)
            for (let nm of split(L))
                this.cRvars[nm] = N;
        return this.CExpr<T[]>(`[${L}\n]`, attNm);
    }

    private gsc(exp: string) {
        // Get Shaked Context string
        // See if the context string this.CT.ct can be abbreviated
        let {ct,lvM, d} = this.CT, n=d+1
        for (let m of exp.matchAll(/\b[A-Z_$][A-Z0-9_$]*\b/gi)) {
            let k: EnvKey = lvM.get(m[0]);
            if (k?.d < n) n = k.d;
        }
        if (n>d)
            return Q;

        let p = d-n, q = p
        while (n--)
            q = ct.indexOf(']', q) + 1;
        return `[${ct.slice(0,p)}${ct.slice(q)}]`;
    }

    // Returns the normalized (absolute) form of URL 'src'.
    // Relative URLs are considered relative to this.FilePath.
    private GetURL(src: string) {
        return new URL(src, this.FP).href
    }
    // Returns the normalized form of URL 'src' without file name.
    private GetP(src: string) {
        return this.GetURL(src).replace(/[^/]*$/, Q);
    }

    // Fetches text from an URL
    async FetchText(src: string): Promise<string> {
        return (
            await RFetch(this.GetURL(src), {headers: this.S.headers})
        ).text();
    }

    // Fetch an RHTML module, either from a <MODULE id> element within the current document,
    // or else from an external file
    async fetchM(src: string): Promise<Iterable<ChildNode>> {
        let m = this.doc.getElementById(src);
        if (!m) {
            // External
            let {head,body} = P.parseFromString(await this.FetchText(src), 'text/html') as Document,
                e = body.firstElementChild as HTMLElement;

            // If the file contains a <MODULE> element we will return its children.
            if (e?.tagName != 'MODULE')
                // If not, we return everything: the document head and body concatenated
                return [...head.childNodes, ...body.childNodes];

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
            throw `Missing attribute [` + nm + `]`;
        return bI && v == Q ? nm : v;
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
    public None() {
        super.delete('hidden'); // Hidden may be added to any construct, so it remains hidden until compiled
        if (this.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}

const

    // Elements that trigger block mode; whitespace before/after/inside is irrelevant
    reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|[OU]L|P|TABLE|T[RHD]|PRE)$/ // ADDRESS|FIELDSET|NOSCRIPT|DATALIST
    , reInline = /^(BUTTON|INPUT|IMG|SELECT|TEXTAREA)$/     // Elements that trigger inline mode before/after
    , reWS = /^[ \t\n\r]*$/                 // Just whitespace, non-breaking space U+00A0 excluded!

    // Routine to add a class name to all selectors in a style sheet
    , AddC = (txt: string, nm: string) =>
        nm ? txt.replaceAll(
/{(?:{.*?}|.)*?}|@[msd].*?{|@[^{;]*|(\w|[-.#:()\u00A0-\uFFFF]|\[(?:"(?:\\.|.)*?"|'(?:\\.|.)*?'|.)*?\]|\\[0-9A-F]+\w*|\\.|"(?:\\.|.)*?"|'(?:\\.|.)*?')+/gsi,
                (m,p) => p ? `${m}.${nm}` : m
            )
        : txt

    // Capitalized propnames cache
    , Cnms: {[nm: string]: string} = NO()

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

, ErrM = (elm: HTMLElement, e: string=Q, maxL?: number): string =>
    e + `\nat ${Abbr(/<[^]*?(?=>)/.exec(elm.outerHTML)[0], maxL)}>`

, crErrN = (m: string) => 
    ass(D.createElement('div')
        , { style: 'color:crimson;font-family:sans-serif;font-size:10pt'
            , innerText: m})

, NoChilds = (srcE: HTMLElement) => {
    for (let n of srcE.childNodes)
        if ( n.nodeType == 1         //Node.ELEMENT_NODE
            || n.nodeType == 3       //Node.TEXT_NODE 
                && !reWS.test(n.nodeValue)
            )
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
}

, ScrollToHash = () =>
    L.hash && setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6)
;

// Map an iterable to another iterable
function* mapI<A, B>(I: Iterable<A>, f: (a:A)=>B, c?: (a:A)=>booly): Iterable<B> {
    for (let x of I)
        if (!c || c(x))
            yield f(x);
}
// Iterate through the trimmed members of a non-empty comma-separated list
function* split(s: string) {
    if (s)
        for (let v of s.split(','))
            yield v.trim();
}
// Iterate through a range of numbers
export function* range(from: number, count?: number, step: number = 1) {
	if (count === U) {
		count = from;
		from = 0;
	}
	for (let i=0;i<count;i++) {
		yield from;
        from += step;
    }
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
               set( _, key: string, val: string) { DL.V = DL.search(key, val); return T}
           });

            this.Subscribe(loc => {
                let h = (this.url = new URL(loc)).href;
                h == L.href || history.pushState(N, N, h);    // Change URL withour reloading the page
                ScrollToHash(); // Scroll to hash, even when URL remains the same
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
    R: RComp,
    DL = new DocLoc(),
    reroute: (arg: MouseEvent | string) => void = 
        arg => {
            if (typeof arg == 'object') {
                if (arg.ctrlKey)
                    return;
                arg.preventDefault();
                arg = (arg.currentTarget as HTMLAnchorElement).href;
            }
            DL.U = new URL(arg, DL.V).href;
        };
export {DL as docLocation, reroute}

// Define global constants
ass(
    G, {RVAR, range, reroute, RFetch, DoUpdate
    }
);

// Close registered child windows on page hide (= window close)
W.addEventListener('pagehide', () => chWins.forEach(w=>w.close()));

// Initiate compilation of marked elements
setTimeout(() => {
    for (let src of <NodeListOf<HTMLElement>>D.querySelectorAll('*[rhtml],*[type=RHTML]')) {
        let o = src.getAttribute('rhtml'); src.removeAttribute('rhtml');
        RCompile(src, o && Ev(`({${o}})`));
    }
}, 0);