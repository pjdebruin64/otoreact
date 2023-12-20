/* The OtoReact framework
* Copyright 2022 Peter J. de Bruin (peter@peterdebruin.net)
* See https://otoreact.dev/
*/
const
    // Some abbreviations
    // Please forgive me for trying to minimize the library file size
    N = null
,   T = <true> !0
,   F = <false>!T
,   U = <undefined> void 0
,   Q = ''
,   E = []        // Empty array, must remain empty
,   G = <typeof globalThis>self
,   W = window
,   D = document
,   L = location    
,   US = "'use strict';"
,   ass = Object.assign as <T extends {}>(obj: T, props: {}) => T
    
// Some utilities
,   K   = x => () => x
,   B   = (f, g) => x => f(g(x))
,   P   = new DOMParser
,   Ev  = eval                  // Note: 'eval(txt)' can access variables from this file, while 'Ev(txt)' cannot!
,   thro= (e: any) => {throw e}
,   dr  = (v: unknown) => v instanceof RV ? v.V : v
,   now = () => performance.now()
,   TryV = (e: string, m: string, s = '\nin ') => {
        try {
            return Ev(e);
        }
        catch (x) {
            throw x + s + m;
        }
    }

    // Default settings 
,   dflts: Settings = {
        bShowErrors:    T,
        // The default basepattern is defined in RCompile.
        //basePattern:    '/',
        bAutoPointer:   T,
        preformatted:   E as string[],
        //storePrefix:    "RVAR_",
        version:        1,
    }
    ;

// Type used for truthy / falsy values
type booly = boolean|string|number|object|null|void;
// Nodes that can have children
type ParentNode = HTMLElement|DocumentFragment;
type Handler = (ev:Event) => booly;

type Settings = Partial<{
    bTiming:        boolean,
    bAbortOnError:  boolean,    // Abort processing on runtime errors,
                                // When false, only the element producing the error will be skipped
    bShowErrors:    boolean,    // Show runtime errors as text in the DOM output
    basePattern:    string,
    bAutoPointer:   boolean,
    bAutoReroute:   boolean,
    bDollarRequired: boolean,
    bKeepWhiteSpace: boolean,
    bKeepComments:  boolean,
    preformatted:   string[],
    storePrefix:    string,
    version:        number,
    headers:        HeadersInit,    // E.g. [['Cache-Control','no-cache']]

    // For internal use
    bSubf:          boolean|2,  // Subfile. 2 is used for RHTML.
}>;

// A  DEPENDENT value of type T in a given context is a routine computing a T, using the current global environment 'env' that should match that context
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dep<T> = (() => T);
// 'DepE<T>' is the same thing, using an optional parameter. The default parameter value should be the global environment, again.
type DepE<T> = ((e?:Environment) => T);

//#region Environments

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
    constructor(
        C?: Context
    ,   a?: booly
        // When 'a' is truthy, the context is to be used for asynchronous compilation and a copy of the maps is to be made.
        // With synchronous compilation, this is not needed because the maps will always be restored to their previous value.
    ) {
        ass(
            this,
            C || {
                d: 0, L: 0, M: 0, ct: Q,
                lvM: new Map, csM: new Map
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
                while(d++ < D)
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

// #endregion

//#region DOMHandling: Area and Range

/* An 'Area' is a (runtime) place to build or update a piece of DOM, with all required information a builder needs.
    Area's are transitory objects; discarded after the builders are finished
*/
type Area<RT = {}, T = true> = {
    r?: Range & RT | T,          // Existing piece of DOM
    // When falsy (undefined or null), the DOM has to be CREATED
    // When truthy (a Range or true), the DOM has to be UPDATED

    pN: ParentNode;            // DOM parent node
    bfor?: ChildNode;     // DOM node before which new nodes are to be inserted

    /* When !r, i.e. when the DOM has to be created: */
    srcN?: ChildNode;     // Optional source node to be replaced by the new DOM 
    pR?: Range;         // The new range shall either be the first child this parent range,
    prR?: Range;        // Or the next sibling of this previous range
}
/* An 'AreaR' is an Area 'ar' where 'ar.r' is a 'Range' or 'null', not just 'true' */

type AreaR<RT = object> = Area<RT, never>;

/* A RANGE object describe a (possibly empty) range of constructed DOM nodes, in relation to the source RHTML.
    It can either be a single DOM node, with child nodes described by a linked list of child-ranges,
    OR just a linked list of subranges.
    It is created by a builder, and contains all metadata needed for updating or destroying the DOM.
*/
class Range<NodeType extends ChildNode = ChildNode>{
    n: NodeType;     // Optional DOM node, in case this range corresponds to a single node
    
    ch: Range;         // Linked list of child ranges (null=empty)
    nx: Range;         // Next range in linked list

    pR?: Range;       // Parent range, only when both belong to the SAME DOM node
    pN?: false | Node;        // Parent node, only when this range has a DIFFERENT parent node than its parent range

    constructor(
        ar: Area             // The constructor puts the new Range into this Area
    ,   n?: NodeType        // Optional DOM node
    ,   public text?: string  // Description, used only for comments
    ) {
        this.n = n;
        if (ar) {
            let {pR: p, prR: q} = ar;
            if (p && !p.n)
                // Set the parent range, only when that range isn't a DOM node
                this.pR = p;
            
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
        if (this.pN == N) {
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
        let r = <Range>this
        ,   n: ChildNode
        ,   p: Range
        ;
        do {
            p = r.pR;
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
    upd?: number;   // Update stamp

    // For reactive elements
    rvars?: Set<RV>;         // RVARs on which the element reacts

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
                rv.$subs.delete(ch));

            // Destroy 'ch'
            ch.erase(ch.pN ?? par);

            // Call 'afterdestroy' handler
            ch.aD?.call(ch.n || par);

            ch = ch.nx;
        }
    }
    // info how to update this range, when it is used as a subscriber
    uInfo?: {b: DOMBuilder, env: Environment, oes: OES, pN: ParentNode, pR: Range, bR: boolean};

    async update() {
        let b: DOMBuilder, bR: boolean, pR: Range;
        ({env, oes, pN, b, bR, pR} = this.uInfo);
        
        if (this.upd != upd)
            await b({r: this, pN, pR}, bR);
    }
}
/* The following function prepares a sub area of a given 'area', 
    containing (when creating) a new Range,
    AND updates 'area' to point to the next range in a linked list.

    It can assign some custom result value to the range,
    and on updating it can optionally erase the range, either when the result value has changed or always.
*/
const PrepRng = <RT>(
    ar: Area            // Given area
,   srcE?: HTMLElement  // Source element, just for error messages
,   text: string = Q    // Optional text for error messages
,   nWipe?: 1|2         // 1=erase 'ar.r' when 'res' has changed; 2=erase always
,   res?: any           // Some result value to be remembered
) : {
    r: Range & Partial<RT>,     // The newly created or updated child range
    sub: Area,          // The new sub area
    cr: booly           // True when the sub-range has to be created
} =>
{
    let {pN, r} = ar as AreaR<{res?: unknown}>
    ,   sub: Area = {pN }
    ,   cr: boolean
    ;
    if (cr = !r) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        
        r = sub.pR = new Range(ar, N
            , srcE ? srcE.tagName + (text && ' ' + text) : text
            );
    }
    else {
        sub.r = r.ch || T;
        ar.r = r.nx || T;

        if (cr = nWipe && (nWipe>1 || res != r.res)) {
            (sub.pR = r).erase(pN); 
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
    ar: Area 
,   tag: string
): {
    r: Range<HTMLElement> & RT, // Sub-range
    sub: Area,                  // Sub-area
    cr: boolean                 // True when the sub-range is being created
} => {
    let r = ar.r as Range<HTMLElement> & RT
    ,   cr = !r;
    if (cr)
        r = new Range(ar,
                ar.srcN
                || ar.pN.insertBefore<HTMLElement>(D.createElement(tag), ar.bfor)
            ) as Range<HTMLElement> & RT;
    else
        ar.r = r.nx || T;

    nodeCnt++
    return { 
        r, 
        sub: {
            pN: pN = r.n, 
            r: r.ch, 
            bfor: N,
            pR: r
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
    let r = ar.r as Range<CharacterData> & {uv?: Set<RV>};
    if (!r)
        r = new Range(ar,
            ar.pN.insertBefore(
                bC ? D.createComment(data) : D.createTextNode(data)
                , ar.bfor)
        );
    else {
        r.n.data = data;
        ar.r = r.nx || T;
    }
    nodeCnt++;
    return r;
}
// #endregion

//#region Component signatures
// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {
    mode: ''|'#'|'@'|'...', 
    nm: string,            // Name
    rq: booly,             // Truthy when required (= not optional)
    pDf: Dep<unknown>,     // Default value expression
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
            ,   v = attr.value;
            if (!dum) {
                if (this.RP) 
                    throw `Rest parameter must be last`;
                if (!nm && !rp)
                    throw 'Empty parameter name';
                let pDf =
                    v   ? m ? RC.CExpr(v, a) : RC.CText(v, a)
                        : on && (() => dU)
                ;
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

        let {ct} = RC.CT
        ,   s: Signat
        ;
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
    public Slots = new Map<string, Signat>;
    public CSlot: Signat;    // Content slot (is also in Slots)

    // In case of a non-async <import>, details of the signature will initially be missing, and the compilation of instances shall await this promise for the signature to be completed
    public task: Promise<any>;              

    // Check whether an import signature is compatible with the real module signature
    IsCompat(sig: Signat): booly {
        if (sig) {
            let c:booly = T
            ,   mP = new Map(mapI(sig.Pams,p => [p.nm, p]))
            ,   p: Parameter;
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
// #endregion

//#region RVARs
export interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export class RV<T = unknown> {
    public $name?: string = U;
    // The value of the variable
    $V: T = U;

    constructor(t?: T | Promise<T>) {
        if (t instanceof Promise) {
            this.$V = U;
            t.then(v => this.V = v, oes.e);
        }
        else
            this.$V = t;
    }
    // Immediate subscribers
    private $imm: Set<Subscriber<T>> = N;
    // Deferred subscribers
    public $subs = new Set<Subscriber<T> | Range>;

    // Use var.V to get or set its value
    get V() {
        // Mark as used
        AR(this);
        return this.$V;
     }
    // When setting, it will be marked dirty.
    set V(v: T) {
        if (v !== this.$V) {
            let p = this.$V;
            this.$V = v;
            this.SetDirty(p);
        }
    }

    // Add a subscriber 's', when it is not null.
    // When 'bImm' is truthy, the subscriber will be called immediately when the RVAR is set dirty;
    // otherwise it will be called by the 'DoUpdate' loop.
    // When 'cr' is truthy, it will be called immediately at the moment of subscribing.
    Subscribe(s: Subscriber<T>, bImm?: boolean, cr?: boolean) {
        if (s) {
            if (cr)
                s(this.$V);
            (bImm ? this.$imm ||= new Set<Subscriber<T>>
                : this.$subs).add(s);
        }
        return this;
    }
    Unsubscribe(s: Subscriber<T>) {
        this.$imm?.delete(s);
        this.$subs.delete(s);
    }
    // Subscribe range
    $SR({pR, pN}: Area, b: DOMBuilder, r: Range, bR:boolean = true) {
        r.uInfo ||= {b, env, oes, pN, pR, bR};
        this.$subs.add(r);
        (r.rvars ||= new Set).add(this);
    }
    // Unsubscribe range
    $UR(r: Range) {
        this.$subs.delete(r);
        r.rvars.delete(this);
    }
    get Set() : (t:T | Promise<T>) => void
    {
        return t =>
            t instanceof Promise ?
                (this.$V = U, 
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
        return this.$V }
    set U(t: T) { this.$V = t; this.SetDirty(); }

    public SetDirty(prev?: T) {
        this.$imm?.forEach(s => s(this.$V, prev));

        this.$subs.size && AJ(this);
    }

    public async Exec() {
        for (let subs of this.$subs)
            try { 
                if (subs instanceof Range)
                    await subs.update();
                else
                    subs(this.$V);
            }
            catch (e) {    
                console.log(e = `ERROR: ` + Abbr(e,1000));
                alert(e);
            }
    }

    valueOf() { return this.V?.valueOf(); }
    toString() { return this.V?.toString() ?? Q; }
}
export type RVAR<T = any, U=T> = RV<T> & U;

const
    // ProxH is the proxyhandler on RV objects rv, that channels all property access either
    // to rv itself or to rv.V / rv.U.
    // Used by the RVAR function and also for the docLocation object.
    ProxH: ProxyHandler<RV<object>> = 
    {
        get(rv: RV, p) {
            return p in rv ? rv[p] : rv.V?.[p];
        },

        set(rv: RV, p, v) {
            if (p in rv)
                rv[p] = v;
            else if (v !== rv.$V[p])
                rv.U[p] = v;
            return T
        },

        deleteProperty(rv, p) {
            return p in rv.$V ? delete rv.U[p] : T;
        },

        has(rv, p) {
            return p in rv || rv.V != N && p in rv.$V;
        }
        /* // This doesn't work with proxies:
        ownKeys(rv) { return Reflect.ownKeys(rv.V); }
        */
    }

/* A "reactive variable" is a variable that listeners can subscribe to. */
export function RVAR<T, U=T>(
    nm?: string
,   val?: T | Promise<T>
,   store?: Store
,   imm?: Subscriber<T>
,   storeNm?: string
,   updTo?: RV
): RV<T> & U {

    if (store) {
        var sNm = storeNm || 'RVAR_' + nm
        ,   s = store.getItem(sNm);
        if (s)
            try { val = JSON.parse(s); }
            catch{}
    }

    let rv = new RV(val).Subscribe(imm, T);
    rv.$name = nm || storeNm;

    store &&
        rv.Subscribe(v => 
            store.setItem(sNm, JSON.stringify(v ?? N))
        );

    updTo &&      
        rv.Subscribe(()=>updTo.SetDirty(),T)
    
    // When 'val' is 'undefined' or some object (null included)
    if (/^[uo]/.test(typeof val))
        // Then make rv a Proxy
        rv = new Proxy<RV<T>>( rv, <ProxyHandler<RV<T>>>ProxH );
    
    if (nm) 
        G[nm] = rv;

    return rv as RV<T> & U;
}

// A subscriber to an RV<T> is either any routine on T (not having a property .T),
// or an updating routine to some area .ar, yielding a promise that has to be awaited for,
// because no two updating routines may run in parallel.
type Subscriber<T = unknown> = 
      ((t?: T, prev?: T) =>unknown);

//#endregion

//#region Runtime data and utilities
type OES = {e: Handler, s: Handler};     // Holder for onerror and onsuccess handlers
type Job = {Exec: () => Promise<unknown> }

// Runtime data. All OtoReact DOM updates run synchronously, so the its current state ca
let env: Environment       // Current runtime environment
,   pN: ParentNode         // Current html node
,   oes: OES = {e: N, s: N}    // Current onerror and onsuccess handlers

    // Auto-react functionality
,   arR:Range & {uv?:Map<RV, booly>;}
    //arPr: Range,
,   arA: AreaR
,   arB: DOMBuilder

,   arVars: Map<RV, booly>
,   AR = (rv: RV, bA?: booly) => 
        arA && (arVars ||= new Map).set(rv, bA || arVars?.get(rv))
,   arChk = () => {
        if (arA && (arR || arVars && (arR = arA.prR))) {
            if(<any>arR===T) throw 'arCheck!'
            arVars?.forEach((bA, rv) =>
                arR.uv?.delete(rv) || rv.$SR(arA, arB, arR, !bA)
            );
            arR.uv?.forEach((_,rv) => rv.$UR(arR) );
            arR.uv = arVars;
            arR.upd = upd;
        }
        arA = arVars = N;
    }

    // Dirty variables, which can be either RVAR's or RVAR_Light or any async function
,   Jobs = new Set<Job>

,   hUpd: number        // Handle to a scheduled update
,   ro: booly = F    // Truthy while evaluating element properties so RVAR's should not be set dirty

,   upd = 0       // Iteration count of the update loop; used to make sure a DOM element isn't updated twice in the same iteration
,   nodeCnt = 0  // Count of the number of updated nodes (elements and text)
,   start: number   // Start time of the current update
    // Child windows to be closed when the app is closed
,   chWins  = new Set<Window>
    // Map of all Otoreact modules that are being fetched and compiled, so they won't be fetched and compiled again
,   OMods   = new Map<string, Promise<[DOMBuilder, Context]>>

// Runtime utilities
,   NoTime = <T>(prom: Promise<T>) => {
        // Just await for the given promise, but increment 'start' time with the time the promise has taken,
        // so that this time isn't counted for the calling (runtime) task.
        let t= now();
        return prom.finally(() => start += now()-t )
    }
,   AJ = (job: Job) => {
        Jobs.add(job);
        hUpd ||= setTimeout(DoUpdate, 1);
    }
;
//#endregion

//#region Element modifiers
type CU = 0|1|2|3;  // 1 = apply on create; 2 = apply on update; 3 = both
type Modifier = {
    mt: MType,          // Modifier type
    nm?: string,         // Modifier name
    d: Dep<unknown>,    // Routine to compute the value
    cu: CU,             // on create/update
    ap?: booly,         // Truthy when auto-pointer should be handled
    fp?: string,        // File path, when needed
    ev?: string,

    c?: string,         // properly cased name
    isS?: booly,        // Truthy when the property type is string
    T?: Modifier,       // For TWO-way properties, the corresponding Target modifier
}
let evM = (M: Modifier) => {
    let v = M.d();
    if (v instanceof RV) {
        if (M.T)
            M.T.d = K(v.Set)
        v = v.V
    }
    return v;
}

// Modifier Types
const enum MType {
    Attr          // Set/update an attribute
,   Prop            // Set/update a property
,   StyleProp         // Set/update a style property
,   ClassNames       // Set/update multiple class names
,   Style       // Set/update multiple style propertues
,   SetProps    // Set/update multiple props
,   Src           // Set the src attribute, relative to the current source document, which need not be the current HTML document
,   Event         // Set/update an event handler
,   Target
    
    // The following modifier types are set áfter element contents has been created/updated.
,   RestParam  // Apply multiple modifiers
,   GetProp      // Set an oncreate handler
,   AutoReroute
}
type RestArg = {ms: Modifier[], xs: unknown[]};
type ModifierData = { [k: number]: any};

// Object to supply DOM event handlers with error handling and 'this' binding.
// It allows the handler and onerror handlers to be updated without creating a new closure
// and without replacing the target element event listener.
class Hndlr {
    oes: OES;       // onerror and onsuccess handler
    h: Handler;     // User-defined handler

    hndl(ev: Event, ...r: any[]) {
            if (this.h)
                try {
                    var {e,s} = this.oes
                    ,   a = this.h.call(ev.currentTarget, ev, ...r);
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

    nm?: string;
    c?: string;
    S?: (v: unknown) => void;
    setTarget(ev: Event) {
        this.S(ev.currentTarget[this.c ||= ChkNm(ev.currentTarget, this.nm)])
    }
}

function ApplyAtts(
        r: Range<HTMLElement> & ModifierData        // ModifierData may store previous information
    ,   cr: boolean
    ,   ms: Modifier[]
    ,   k = 0                 // Index into ModifierData
    ,   xs?: unknown[]        // Optional modifier values (in case of a Rest argument)
        ): number {
    // Apply all modifiers: adding attributes, classes, styles, events
    ro= T;
    let e = r.n
    ,   cu = cr ? 1 : 2
    ,   hc: booly = F
    ,   i = 0
    ,   H: Hndlr
        ;
    try {
        for (let M of ms) {
            if (M.cu & cu)      // '&' = Bitwise AND
            {
                let nm = M.nm, x = xs ? xs[i] : evM(M);
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
                                : nm=='valueasnumber' //&& (e as HTMLInputElement).type == 'number'
                                        ? 'value' 
                                : nm)
                        ]=='string')
                            // replace null, undefined and NaN (note that NaN!=NaN) by the empty string
                            x = x==N || x!=x ? Q : x.toString();
                        // Avoid unnecessary property assignments; they may have side effects
                        if (x != e[nm=M.c])
                            e[nm] = x;
                        break;

                    case MType.Target:
                        // Set and remember new handler
                        if (cr) {
                            (H = r[k] = new Hndlr).oes = oes;
                            e.addEventListener(M.ev, H.setTarget.bind(H));
                            H.nm = nm;
                        }
                        else
                            H = <Hndlr>r[k];

                        H.S = x as (v: unknown) => void;
                        break;

                    case MType.Event:
                        // Set and remember new handler
                        if (cr) {
                            (H = r[k] = new Hndlr).oes = oes;
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
                        // In case of "srcset", M.ev is truthy.
                        // 'M.fp' is the URL of the source document.
                        // Each URL in attribute value 'x' is to be interpreted as relative to 'M.fp'.
                        e[nm] = (x as string).replace(
                            M.ev ? /(.+?)(,|$)/gs : /(.+)()/s,
                            (_,u,r) => new URL(u, M.fp).href + r
                            );
                        break;

                    case MType.SetProps:
                        ass(e, x);
                        break;

                    case MType.ClassNames:
                        // Set or update a collection of class names, without disturbing classnames added by other routines
                        let p = <Set<string>>r[k]  // Previous set of classnames, possibly to be removed
                        ,   n = M.cu & 2 ? (r[k] = new Set<string>) : N; // New set of classnames to remember, onl
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
                            k = ApplyAtts(r, cr, (x as RestArg).ms, k, (x as RestArg).xs);
                        break;

                    case MType.GetProp:
                        (x as (e:HTMLElement) => void)(nm ? e[M.c ||= ChkNm(e, nm)] : e)
                        break;

                    case MType.AutoReroute:
                        if ( 
                            // When the A-element has no 'onclick' handler or 'download' or 'target' attribute
                            !(e as HTMLAnchorElement).download
                            && !(e as HTMLAnchorElement).target
                            // and the (initial) href starts with the current basepath
                            && (e as HTMLAnchorElement).href.startsWith(L.origin + dL.basepath)
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
//#endregion

//#region Compiling

// Inside builder routines, a local variable is represented by a routine to set its value,
// having additional properties 'nm' with the variable name and 'i' with its index position in the environment 'env'
type LVar<T=unknown> = ((value?: T) => T) & {nm: string};

/* A 'DOMBuilder' is the semantics of a piece of RHTML.
    It can both build (construct, create) a new range of DOM within an Area, and update an earlier created range of DOM within that same Area.
    The created DOM is yielded in 'ar.r'.
    'bR' is: truthy when the DOMBuilder is called on behalf of a 'thisreactson' attribute on the current source node,
        false when called on behalf of a 'reacton' on the current node
*/
type DOMBuilder<RT = void|boolean> = ((ar: Area, bR?: boolean) => Promise<RT>) 
    & {
        auto?: string; // When defined, the DOMBuilder will create an RVAR that MIGHT need auto-subscribing.
        nm?: string;   // Name of the DOMBuilder
    };

// Whitespace modes of the compiler
const enum WSpc {
    zero = 0,
    block = 1,      // Block mode; whitespace is irrelevant
    inlineSpc,      // Inline mode with preceeding whitespace, so more whitespace can be skipped
    inline,         // Inline mode, whitespace is relevant
    preserve        // Preserve all whitespace
}

// Instances of RComp perform synchronous compilation.
// Everytime an asynchronous compilation is wanted, a instance shall be cloned.
let   iRC = 0       // Numbering of RComp instances
,   iLS = 0      // Numbering of local stylesheet classnames
    ;
class RComp {
    public num = iRC++;  // Rcompiler instance number, just for identification during debugging
    public S: Settings;

    public CT: Context         // Compile-time context

    private doc: Document;

    // During compilation: node to which all static stylesheets are moved
    public hd: HTMLHeadElement|DocumentFragment|ShadowRoot;

    // Source file path, used for interpreting relative URLs
    public fp: string;

    lscl: string[];     // Local static stylesheet classlist
    ndcl: number;       // Number of dynamic local classnames
 
    constructor(
        RC?: RComp
    ,   FP?: string
    ,   settings?: Settings
    ,   CT = RC?.CT
    ) { 
        this.S   = {... RC ? RC.S : dflts, ...settings};
        this.fp  = FP || RC?.fp;
        this.doc = RC?.doc || D
        this.hd  = RC?.hd || this.doc.head;
        this.CT    = new Context(CT, T);
        this.lscl= RC?.lscl || E;
        this.ndcl = RC?.ndcl || 0;
    }

/*
    'Framed' compiles a range of RHTML within a new variable-frame.
    Its parameter 'Comp' is the actual compiling routine, which is executed in a modified context,
    and receives a parameter 'SF' (Start Frame),
    to be used in the builder routine created by 'Comp' to convert the environment 'env' into a new frame,
    and that returns a routine EF (End Frame) to restore the precious environment
*/  
    private Framed<T>(
        Comp: (
            StartScope: (sub: Area, r?:Range & {env?:Environment}) => {sub: Area, EF: () => void }
        )=>Promise<T>
    ): Promise<T> {
        let {CT, rActs} = this
        ,   {ct,d,L,M} = CT
        ,   A = rActs.length
        ,   nf: booly = L - M;
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

                env = r.env ||= ass([nf ? e : e[0]], {cl: e.cl});
                
                return {sub, EF: () => {env = e;} }; // 'EndFrame' routine
            }
        ).finally(() =>        
        {
            // Restore the context
            this.CT = ass(CT, <Context>{ct,d,L,M});
            
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
        ,   {ct, L} = CT
        ,   A = rActs.length;

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
    public LV<T>(nm: string): LVar<T> {
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
            ,   i = ++CT.L        // Reserve a place in the environment
            ,   vM = CT.lvM
            ,   p = vM.get(nm);    // If another variable with the same name was visible, remember its key

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
        ,   {csM: cM, M, d}= CT;

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

    // Compile a source tree into a DOMBuilder
    public async Compile(
        elm: ParentNode 
    ,   nodes?: Iterable<ChildNode>  // Compile the element itself, or just its childnodes
    ): Promise<DOMBuilder>
    {
        for (let tag of this.S.preformatted)
            this.sPRE.add(tag.toUpperCase());
        this.srcCnt = 0;
        //this.log('Compile');
        let t0 = now()
        ,   b =
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

    public bldr: DOMBuilder;

    private ws = WSpc.block;  // While compiling: whitespace mode for the node(s) to be compiled; see enum WSpc
    private rt: booly = T;    // While compiling: may the generated DOM output be right-trimmed

    private srcCnt: number;   // To check for empty Content

    private CChilds(
        PN: ParentNode
    ,   nodes: Iterable<ChildNode> = PN.childNodes
    ): Promise<DOMBuilder> {
        let ES = this.SS(); // Start scope
        return this.CIter(nodes).finally(ES)
    }

    // Compile some stretch of childnodes
    private async CIter(iter: Iterable<ChildNode>): Promise<DOMBuilder> {
        let {rt} = this     // Indicates whether the output may be right-trimmed
        ,   arr = Array.from(iter)
        ,   L = arr.length
        ,   bs = [] as Array< DOMBuilder >
        ,   i=0
            ;
        // When ' rt', then remove node at the end containing nothing but whitespace
        while(rt && L && !/[^ \t\n\r]/.test(arr[L - 1]?.nodeValue)) 
            L--;        

        while (i<L) {
            let srcN = arr[i++]
            ,   bl: DOMBuilder;
            this.rt = i==L && rt;
            switch (srcN.nodeType) {
                
                case 1:         //Node.ELEMENT_NODE:
                    this.srcCnt ++;
                    bl = await this.CElm(srcN as HTMLElement);
                    break;

                case 8:         //Node.COMMENT_NODE:
                    if (!this.S.bKeepComments)
                        break;
                    var bC = T;
                case 3:         //Node.TEXT_NODE:
                    this.srcCnt ++;
                    let str = srcN.nodeValue
                    ,   getText = this.CText( str ), {fx} = getText;
                    if (fx !== Q) { // Either nonempty or undefined
                        bl = async (ar: Area<{uv:Map<RV, booly>}, never>) => {
                            // Perform auto-react check on previous node, when needed
                            arA && arChk();

                            // Set the scene for auto-react check on this node
                            arVars = N;
                            arR = ar.r;
                            arB = bl;                      
                            
                            PrepData(arA = ar, getText(), bC);

                            arA && arChk();
                        }
                        
                        // Update the compiler whitespace mode
                        if (!bC && this.ws < WSpc.preserve)
                            this.ws = / $/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    // 'break' not required
            }
            
            if (bl) 
                bs.push(bl);
        }

        return (L = bs.length) ?
            L < 2 ? bs[0]
                : async function Iter(ar: Area)
                {   
                    for (let b of bs)
                        await b(ar);
                }
            : N;
    }

    // Compile any source element
    private async CElm(srcE: HTMLElement, bI?: boolean
        ): Promise<DOMBuilder> {       
        try {
            let tag = srcE.tagName
                // List of source attributes, to check for unrecognized attributes
            ,   ats =  new Atts(srcE)

                // Global attributes (this)react(s)on / hash / if / renew handlers,
                // to be compiled after the the element itself has been compiled
            ,   ga: Array<{at: string, m: RegExpExecArray, dV: Dep<RVAR[] | unknown[] | booly>}> = []

                // Generic pseudo-event handlers to be handled at runtime BEFORE and AFTER building
            ,   bf: Array<{at: string, txt: string, h?: Dep<Handler>, C: boolean, U: boolean, D: boolean}> = []
            ,   af: Array<{at: string, txt: string, h?: Dep<Handler>, C: boolean, U: boolean, D: boolean}> = []
                                
                // The intermediate builder will be put here
            ,   bl: DOMBuilder
                // 'bA' is set rather than 'bl' for builders that should abort the current range of nodes when an error occurs.
                // E.g. when a <DEF> fails then the whole range should fail, to avoid further errors
            ,   bA: DOMBuilder
                
                // See if this node is a user-defined construct (component or slot) instance
            ,   constr = this.CT.getCS(tag)

                // Pre-declared variables for various purposes
            ,   b: DOMBuilder
            ,   m: RegExpExecArray
            ,   nm: string;

                // Check for generic attributes
            for (let [at] of ats)
                if (m = 
/^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(?:create|update|destroy|compile)+)$/
//     123                4       56                7      8              9          
                     .exec(at))
                    if (m[1])       // (?:this)?reacts?on|on
                        m[4] && tag!='REACT'    // 'on' is only for <REACT>
                        || m[7] && tag=='FOR'   // <FOR> has its own 'hash'
                        // other cases are put in the list:
                        ||  ga.push(
                                {
                                    at, 
                                    m, 
                                    dV: 
                                        m[5]  // on((error)|success)
                                            ? this.CHandlr(ats.g(at), at)
                                        : m[8] // if
                                            ? this.CAttExp(ats, at)
                                        :   // reacton, hash
                                          this.CAttExps<RVAR>(ats, at)
                                });
                    else { 
                        let txt = ats.g(at);
                        if (/cr|d/.test(at))  // #?(before|after|on)(create|update|destroy|compile)+
                            // We have a pseudo-event
                            (m[9] ? bf : af)    // Is it before or after
                            .push({
                                at, 
                                txt, 
                                C: /cr/.test(at),    // 'at' contains 'create'
                                U: /u/.test(at),    // 'at' contains 'update'
                                D: /y/.test(at),    // 'at' contains 'destroy'
                                // 'before' events are compiled now, before the element is compiled
                                h: m[9] && this.CHandlr(txt, at)
                                // 'after' events are compiled after the element has been compiled, so they may
                                // refer to local variables introduced by the element.
                            });
                        if (/m/.test(at))    // oncompile
                            // Execute now, with 'srcE' as 'this'
                            TryV(`(function(){${txt}\n})`, at).call(srcE);
                    }

            if (constr)
                bl = await this.CInst(srcE, ats, constr);
            else
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE': {
                        NoChilds(srcE);
                        let rv      = ats.g('rvar') // An RVAR
                        ,   vLet    = this.LV(rv || ats.g('let') || ats.g('var', T))
                        ,   vGet    = rv && this.CT.getLV(rv) as DepE<RVAR>
                        ,   {G,S}   = this.cAny(ats, 'value')
                        ,   bU      = ats.gB('updating') || rv
                        ,   dUpd    = rv   && this.CAttExp<RVAR>(ats, 'updates')
                        ,   onMod   = rv && this.CPam<Handler>(ats, 'onmodified')
                        ,   dSto    = rv   && this.CAttExp<Store>(ats, 'store')
                        ,   dSNm    = dSto && this.CPam<string>(ats, 'storename')
                        ;

                        bA = async function DEF(ar, bR?) {
                            let {cr,r} = PrepRng<{rv: RV}>(ar, srcE)
                            ,   v: unknown;
                            // Evaluate the value only when:
                            // !r   : We are building the DOM
                            // bU   : 'updating' was specified
                            // bR not null: The routine is called because of a 'reacton' subscribtion

                            // Note that when !bU, then arChk() is called /before/ G() is evaluated,
                            // so that the construct won't react on RVARS used by G().
                            if ( bU || arChk() || cr || bR != N){
                                try {
                                    ro=T;
                                    v = G?.();
                                }
                                finally { 
                                    ro = F; 
                                }

                                if (rv) {
                                    r.rv = v instanceof RV && v;
                                    if (cr)
                                        (vLet as LVar<RVAR>)(
                                            RVAR(N, dr(v),
                                                dSto?.(),
                                                r.rv ? x => {r.rv.V = x} : S?.(),
                                                dSNm?.() || rv,
                                                dUpd?.()
                                            )
                                        )
                                        .Subscribe(onMod?.());
                                    else
                                        vGet().Set(dr(v));
                                }
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
                        ,   bIncl = ats.gB('include')
                        ,   bAsync = ats.gB('async')
                        ,   lvars: Array<LVar & {g?: DepE<unknown>}> 
                                        = this.LVars(ats.g('defines'))
                        ,   imps: Array<Signat & {g?: DepE<ConstructDef>}>
                                        = Array.from(mapI(srcE.children, ch => new Signat(ch, this)))
                        ,   DC = this.LCons(imps)
                        ,   cTask: Promise<[DOMBuilder, Context]>
                                = OMods.get(src)   // Check whether module has already been compiled
                            ;
                            
                        if (!cTask) {
                            // When the same module is imported at multiple places, it needs to be compiled only once
                            let C = new RComp(this, this.GetP(src), {bSubf: T}, new Context);
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
                                    ? !sig.IsCompat(S) && thro(
                                        `Import signature ${sig.srcE.outerHTML} is incompatible with module signature ${S.srcE.outerHTML}`)
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
                        
                        bA = async function IMPORT(ar: Area) {
                            let {sub,cr,r} = PrepRng<{v:Environment}>(ar, srcE);
                            arA=N;
                            if (cr || bIncl) {
                                try {
                                    var b = await NoTime(task)
                                    ,   s = env
                                    ,   MEnv = env = r.v ||= [];

                                    await b(bIncl ? sub : {pN: D.createDocumentFragment()});
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
                        bl = b && function(ar, bR) {
                            //let {sub} = PrepRng(ar);
                            return !(ar.r && bR) && b(ar)
                        }
                    break;

                    case 'RHTML': {
                        let {ws,rt} = this
                        ,   S = this.CPam<string>(ats, 'srctext',T)
                            // Undocumented feature: a pseudo-event fired after the compile phase
                        ,   dO = this.CPam<Handler>(ats, "onç")
                        ,   s: Settings = {bSubf: 2, bTiming: this.S.bTiming}
                            ;
                        NoChilds(srcE);
                        bl = async function RHTML(ar) {
                            let {r} = PrepElm<{rR: Range, src: string}>(ar, 'r-html')
                            ,   src = S()
                                ;

                            if (src != r.src) {
                                let sv = env
                                ,   C = ass( new RComp(N, L.origin + dL.basepath, s)
                                            , {ws,rt})
                                ,   sh = C.hd = r.n.shadowRoot || r.n.attachShadow({mode: 'open'})
                                ,   pR = r.rR ||= new Range(N, N, tag)
                                ,   tmp = D.createElement(tag)
                                    ;

                                // This is just to allow imports from a module that is included in 'src'
                                // Modules are saved in OMod so they don't react on updates, though
                                (C.doc = D.createDocumentFragment() as Document).appendChild(tmp)

                                pR.erase(sh); 
                                sh.innerHTML = Q;

                                try {
                                    // Parsing
                                    tmp.innerHTML = r.src = src;
                                    // Compiling
                                    await C.Compile(tmp, tmp.childNodes);
                                    dO && dO()(U);
                                    // Building
                                    await C.Build({ pN: sh, pR });
                                }
                                catch(e) { 
                                    sh.appendChild(crErrN(e))
                                }
                                finally { env = sv; }
                            }
                            pN = ar.pN;
                        };
                    } break;

                    case 'SCRIPT': 
                        bA = await this.CScript(srcE as HTMLScriptElement, ats); 
                        break;

                    case 'COMPONENT':
                        bA = await this.CComp(srcE, ats);
                        break;

                    case 'DOCUMENT': {
                        let vNm = this.LV(ats.g('name', T))
                        ,   bEncaps = ats.gB('encapsulate')
                        ,   PC = this
                        ,   RC = new RComp(this)
                        ,   vPams = RC.LVars(ats.g('params'))
                        ,   vWin = RC.LV(ats.g('window',F,F,T))
                        ,   H = RC.hd = D.createDocumentFragment()   //To store static stylesheets
                        ,   b = await RC.CChilds(srcE)
                        ;
                        bA = async function DOCUMENT(ar: Area) {
                            if (PrepRng(ar).cr) {
                                let {doc, hd} = PC
                                ,   docEnv = env
                                ,   wins = new Set<Window>
                                ;
                                //Set the 'name' variable to an object containing the wanted routines
                                vNm({
                                    async render(w: Window, cr: boolean, args: unknown[]) {
                                        let s = env
                                        ,   Cdoc = RC.doc = w.document
                                        ;
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
                                            
                                            await b({pN: Cdoc.body});
                                        }
                                        finally {env = s}
                                    },
                                    open(target?: string, features?: string, ...args: unknown[]) {
                                        let w = W.open(Q, target || Q, features)
                                        ,   cr = !chWins.has(w);
                                        if (cr) {
                                            w.addEventListener('keydown', 
                                                (event:KeyboardEvent) => {if(event.key=='Escape') w.close();}
                                            );
                                            w.addEventListener('close', 
                                                () => chWins.delete(w), wins.delete(w));
                                            //w.addEventListener('load', () => w.focus());
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
                        
                        bl = b && (async(ar: Area) => {
                            //PrepRng(ar, srcE);
                            let {pN, bfor} = ar
                            ,   p: Range;
                            try {
                                // Execute 'b' with the document header as parent node
                                await b(ass(ar, {pN: this.hd, bfor: N}));
                            }
                            finally {
                                if (p = ar.prR) p.pN = ar.pN;  // Allow the created range to be erased when needed
                                ass(ar, {pN, bfor});
                            }
                        });
                    break;

                    case 'STYLE': {
                        let src = ats.g('src'), sc = ats.g('scope')
                        ,   nm: string, {lscl: l, hd} = this;

                        if (sc) {
                            /^local$/i.test(sc) || thro('Invalid scope');
                            // Local scope
                            // Get a unique classname for this stylesheet
                            nm = `\uFFFE${iLS++}`; // or e.g. \u0212

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
                        ,   sc = ats.g('scope')
                        ,   {bf,af} = this.CAtts(ats)
                        ,   i: number
                        try {
                            this.S.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = WSpc.block;

                            let b = await (sc ?
                                ( /^local$/i.test(sc) || thro('Invalid scope')
                            ,   (i = this.ndcl++)
                            ,   this.rActs.push(() => this.ndcl--)
                            ,   this.CUncN(srcE, ats)
                                ) 
                                : this.CIncl(srcE, ats)
                            );

                            bl = b && async function RSTYLE(ar: Area) {
                                let {r,cr,sub} = PrepElm<{cn: string, cl: string[], tx:string} & ModifierData>(ar, 'STYLE')
                                ,   k = ApplyAtts(r, cr, bf);

                                if (sc) {
                                    let txt = (await b(ar) as HTMLElement).innerText
                                    ,   nm =  r.cn ||= `\uFFFE${iLS++}`;
                                
                                    if (txt != r.tx)
                                        // Set the style text
                                        // Would we set '.innerText', then <br> would be inserted
                                        r.n.innerHTML = AddC(r.tx = txt, nm);

                                    (env.cl = r.cl ||= [... env.cl||E])[i] = nm;
                                }
                                else
                                    await b(sub);

                                ApplyAtts(r, cr, af, k);
                                pN = ar.pN;
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
                        let dN = this.CPam<string>(ats, 'name', T)
                        ,   dV = this.CPam<string>(ats, 'value', T);
                        bl = async function ATTRIB(ar: Area){
                            let r = PrepRng<{v:string}>(ar, srcE).r
                            ,   n0 = r.v
                            ,   nm = r.v = dN();
                            if (n0 && nm != n0)
                                (pN as HTMLElement).removeAttribute(n0);
                            if (nm)
                                (pN as HTMLElement).setAttribute(nm, dV());
                        };
                        break;

                    case 'COMMENT': {
                        let {ws} = this
                        ,   b = (this.rt = F, this.ws = WSpc.preserve,
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
                        bl = await this.CHTML(srcE, ats);
                }
            
            bI || ats.None();
        
            // We are going to add pseudo-event and global attribute handling.
            // We keep the current builder function name, so we can attach it to the final builder.
            // And when the current builder 'bl' is empty, we replace it by the dummy builder, so the handler routines get
            // a non-empty builder.
            // When no handling is added, we'll make 'bl' empty again.
            
            nm = (bl ||= bA ||= dB).name;

            // Add pseudo-event handling
            if (bf.length || af.length) {
                // Compile after-handlers now
                for (let g of af)
                    g.h = this.CHandlr(g.txt, g.at);

                let b = bl;
                bl = async function Pseu(ar: AreaR, bR) {                   
                    let {r, sub, cr} = PrepRng<{bU: Handler, aU: Handler}>(ar, srcE)
                    ,   sr = sub.r || T

                    ,   bD = ph(bf, 'bU', sr != T && sr.n || pN);

                    await b(sub, bR);

                    // We need the range created or updated by 'b'
                    // This is tricky. It requires that b creates at most one (peer) range
                    let rng = cr
                            // When we are building, then 'b' has range sub.prR, if any
                            ? sub.prR
                            // When we are updating, then 'b' has a range when the current sub.r is different from sr, and sr is that range.
                            : <Range>sr                        
                    
                    ,   aD = ph(af, 'aU', rng.n || pN);

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
            for (let {at, m, dV} of this.S.version ? ga : ga.reverse()) {
                let b = bl
                ,   es = m[6] ? 'e' : 's'  // onerror or onsuccess
                ,   bA = !m[3]    // not 'thisreactson'?
                    ;

                if (m[2]) // reacton / thisreactson
                    bl = this.ErrH(
                        function on(ar: Area, bR) {
                            // Consider the currently provided rvars
                            for (let rv of dV() as RVAR[])
                                if (rv) {
                                    if (!rv.$SR)
                                        throw `This is not an RVAR\nat '${at}'`; 
                                    AR(rv, bA);
                                }  
                            
                            return b(PrepRng(ar, srcE).sub, bR);
                        }
                        , srcE);
                
                else
                    bl = 
                        m[5]  // set onerror or onsuccess
                        ? async function SetOnES(ar: Area, bR) {
                            let s = oes    // Remember current setting
                            ,   {sub, r} = PrepRng<{oes: object}>(ar, srcE, at);

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
                            let {sub, r,cr} = PrepRng<{v:unknown[]}>(ar, srcE, at)
                            ,   ph  = r.v;
                            r.v = <unknown[]>dV();
                            if (cr || r.v.some((hash, i) => hash !== ph[i]))
                                return b(sub, bR);
                        }
                        : m[8]  // #if
                        ?   function hIf(ar: Area, bR) {
                                let c = <booly>dV()
                                ,   p = PrepRng(ar, srcE, at, 1, !c)
                                if (c)
                                    return b(p.sub, bR)
                            }
                        :   // Renew
                            function renew(sub: Area, bR) {
                                return b(
                                    PrepRng(sub, srcE, at, 2).sub
                                    , bR
                                );
                            }
            }

            return bl != dB && ass(
                this.ErrH(bl, srcE, !!bA)
                , {nm}
                );
        }
        catch (m) { throw ErrM(srcE, m); }
    }

    private ErrH(b: DOMBuilder<any>, srcN: ChildNode, bA?: boolean): DOMBuilder
    {
        // Transform the given DOMBuilder into a DOMBuilder that handles errors by inserting the error message into the DOM tree,
        // unless an 'onerror' handler was given or the option 'bShowErrors' was disabled.
        // This routine also handles auto-react checking.
        let bl = b && (async (ar: AreaR<{eN: ChildNode; uv:Map<RV, booly>;}>, bR: boolean) => {
            let r = ar.r;
            if (r?.eN) {
                // Remove an earlier error message in the DOM tree at this point
                pN.removeChild(r.eN);
                r.eN = U;
            }
            try {
                // First perform auto-react checking on the parent node, when needed
                arA && arChk();

                // Then set the scene for auto-react checking on the current node
                arVars = N;
                arR = ar.r;
                arB = bl;
                // Initiate the node builder, without awaiting the result.
                // It is required that auto-react checking is done BEFORE awaiting any promise, and before 'env' is set to a different value.
                // All code paths should respect that.
                let prom = b(arA = ar, bR);

                // Now do the check, if still needed
                arA && arChk();

                // Then we can await the builder result.
                await prom;
            } 
            catch (m) {
                if (m) {
                    let msg = 
                        srcN instanceof HTMLElement ? ErrM(srcN, m, 45) : m
                    ,   e = oes.e;

                    if (this.S.bAbortOnError)
                        throw msg;

                    this.log(msg);
                    e ? e(m)
                    : this.S.bShowErrors ?
                        (r||{} as typeof r).eN = ar.pN.insertBefore(crErrN(msg), ar.r?.FstOrNxt)
                    : U;
                    if (bA)
                        throw Q;
                }
            }
        });

        return bl;
    }

    private CIncl(srcE: HTMLElement, ats: Atts, bR?: booly, cn: Iterable<ChildNode> = srcE.childNodes): Promise<DOMBuilder> {
        // Compile the contents of any node that may contain a 'src' attribute to include external source code.
        // With 'bReq', 'src' is required.
        // The source code may be server side included.
        let src = ats?.g('src', bR);

        // When src is given,
        return src ?
        // Then use a separate RComp object to asynchronously fetch and compile the included or external source code
        // , perhaps with a different base path.
        // We need a separate frame for local variables in this file, so that compilation of the main file can continue
            this.Framed(async SF => {
                let C = new RComp(this, this.GetP(src), {bSubf: T})
                ,   task = 
                        srcE.children.length || srcE.textContent.trim()
                        ? C.Compile(N, cn)
                        // Parse the contents of the file, and compile the parsed contents of the file in the original context
                        : this.fetchM(src).then(cn => C.Compile(N, cn))
                        //.catch(e => {alert(e); throw e})
                        ;

                return async function INCL(ar) {
                    PrepRng(ar, srcE);
                    arChk();
                    let {sub,EF} = SF(ar);
                    await (await NoTime(task))(sub).finally(EF);
                };
            })
            // Otherwise we just compile just the child contents
            : this.CChilds(srcE, cn)
    }

    private async CUncN(srcE: HTMLElement, ats?: Atts): Promise<DOMBuilder<HTMLElement>> {
        // Compile the children of an "unconnected node", that won't be included in the output DOM tree, but that yields data for some other purpose (Comment, RSTYLE).
        // When 'ats' is provided, then a 'src' attribute is accepted.
        let b = await this.CIncl(srcE, ats);

        return b && (async (ar:Area) => {
            let {r, sub} = PrepRng<{p: HTMLElement}>(ar, srcE)
            ,   p = sub.pN = r.p ||= D.createElement(srcE.tagName);
            r.pN = F; sub.bfor = N;
            await b(sub);
            return p;
        });
    }

    private async CScript(srcE: HTMLScriptElement, ats: Atts) {
        let {type, text, defer, async} = srcE
            // External source?
        ,   src = ats.g('src')     // Niet srcE.src
            // Any variables to define?
        ,   defs = ats.g('defines') || ''
        ,   m = /^\s*(((text|application)\/javascript|(module)|)|(otoreact)(\/(((local)|static)|global)|(.*?)))\s*(;\s*type\s*=\s*(")?module\12)?\s*$|/i.exec(type)
            //         123----------------3             4------4 2 5--------56  78-----8 9------9       7 A---A61   B               C-C          B 
            // True if a local script shpuld be re-executed at every update
        ,   bU = ats.gB('updating')
            // Current context string befóre NewVars
        ,   {ct} = this.CT
            // local or static: Local variables to be defined
        ,   lvars = m[8] && this.LVars(defs)
        ,   ex: () => Promise<object>
            ;
        
        ats.clear();   // No error on unknown attributes

        // Script have to be handled by Otoreact in the following cases:
        // When it is a 'type=otoreact' script
        if (m[5] && (!m[10] || thro("Invalid script type"))
            // Or when it is a classic or module script ánd we are in a subfile, so the browser doesn't automatically handle it */
            || m[2] != N && this.S.bSubf)
        {
            if (m[9]) {
                // otoreact/local script
                let prom
                 = (async () => 
                    //this.Closure<unknown[]>(`{${src ? await this.FetchText(src) : text}\nreturn[${defs}]}`)
                    // Can't use 'this.Closure' because the context has changed when 'FetchText' has resolved.
                    Ev(US + `(function([${ct}]){{\n${src ? await this.FetchText(src) : text}\nreturn{${defs}}}})`
                    ) as DepE<object>
                    // The '\n' is needed in case 'text' ends with a comment without a newline.
                    // The additional braces are needed because otherwise, if 'text' defines an identifier that occurs also in 'ct',
                    // the compiler gives a SyntaxError: Identifier has already been declared
                    )();
                ex = async() => (await prom)(env);
            } 
            else if (m[4] || m[11])
                // A Module script, either 'type=module' or type="otoreact...;type=module"
                ex = K(
                     src 
                    ?   import(this.gURL(src)) // External script
                    :   import(
                            // For internal scripts, we must create an "ObjectURL"
                            src = URL.createObjectURL(
                                new Blob(
                                    // Imports in the script may need an adjusted URL
                                    [ text.replace(
                                        /\/\/.*|\/\*[^]*?\*\/|(['"`])(?:\\.|[^])*?\1|(\bimport\b(?:(?:[a-zA-Z0-9_,*{}]|\s)*\bfrom)?\s*(['"]))(.*?)\3/g,
                                    //          1-----1                2                                                3----324---4
                                        (p0, _, p2, p3, p4) => p2 ? p2 + this.gURL(p4) + p3 : p0
                                    ) ]
                                    , {type: 'text/javascript'}
                                )
                            )
                            // And the ObjectURL has to be revoked
                        ).finally(() => URL.revokeObjectURL(src))
                    );
            else {
                // Classic or otoreact/static or otoreact/global script
                let pTxt: Promise<string>
                    = (async() => `${m[5] ? US : Q}${src ? await this.FetchText(src) : text}\n;({${defs}})`)()
                ,   Xs: Array<unknown>;
                // Routine to initiate execution, at most once
                ex = async() => Xs ||= Ev(await pTxt);

                if (src && async)
                    // Exec asynchronously as soon as the script is fetched
                    ex();
                else if (!m[5] && !defer)
                    // Exec and await standard classic scripts without defer immediately
                    await ex();
                // else (m[5] || defer) defer execution till it is required
            }

            return async function SCRIPT(ar: Area) {
                PrepRng(ar,srcE);
                bU || arChk();
                if (!ar.r || bU) {
                    let obj = await ex();
                    if (lvars)
                        lvars.forEach(lv => lv(obj[lv.nm]));
                    else
                        ass(G, obj);
                }
            };
        }
    }

    private async CCase(srcE: HTMLElement, ats: Atts): Promise<DOMBuilder> {
        let bH = ats.gB('hiding')
        ,   dV = this.CAttExp<string>(ats, 'value')
        ,   cases: Array<{
                n: HTMLElement,
                ats: Atts,
                body?: Iterable<ChildNode>,
            }> = []
        ,   body: ChildNode[] = []
        ,   bI = srcE.tagName == 'IF'
        ,   bT: booly
        ,   bE: booly
        ;
        for (let n of srcE.childNodes) {
            if (n instanceof HTMLElement) 
                switch (n.tagName) {
                    case 'THEN':
                        // In this case 'srcE' holds the relevant attributes
                        bT = cases.push({n, ats});
                        // 'n' may not have attributes
                        new Atts(n as HTMLElement).None();
                        continue;
                    case 'ELSE':
                        if (bE) 
                            throw "Double <ELSE>";
                        bE = T;
                        // Fall through!
                    case 'WHEN':
                        cases.push({n, ats: new Atts(n)});
                        if (bI && !bE)
                            throw "<IF> contains <WHEN>";
                        continue;
                }
            body.push(n);
        }
        if (bI && !bT)
            cases.unshift({n: srcE, ats, body});

        type Alt = // represents an "alternative": a compiled WHEN/THEN/ELSE part
        {
            cond?: Dep<booly>,  // Condition
            patt?: {lvars: LVar[], RE: RegExp, url?: boolean},  //Pattern
            not: boolean,       // Negate
            b: DOMBuilder,      // Builder
            n: HTMLElement,     // Source node
        };
        let aList: Array<Alt> = []
        ,   {ws, rt, CT}= this
        ,   postCT = CT
        ,   postWs: WSpc = 0 // Highest whitespace mode to be reached after any alternative
        ;
        for (let {n, ats, body} of cases) {
            let ES = 
                ass(this, {ws, rt, CT: new Context(CT)})
                .SS();
            try {
                let cond: Dep<booly>
                ,   not: boolean = F
                ,   patt:  {lvars: LVar[], RE: RegExp, url?: boolean}
                ,   p: string
                ;
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
                        aList.push({
                            cond, not, patt
                            , b: await this.CIncl(n, ats, F, body) || dB
                            , n
                        });
                        ats.None();
                        postWs = Math.max(postWs, this.ws);
                        postCT = postCT.max(this.CT);
                }
            } 
            catch (m) { throw bI ? m : ErrM(n, m); }
            finally { ES(); }
        }
        this.ws = !bE && ws > postWs ? ws : postWs;
        this.CT = postCT;

        return aList.length && async function CASE(ar: Area, bR) {
            let val = dV?.()
            ,   RRE: RegExpExecArray
            ,   cAlt: Alt;
            try {
                // First determine which alternative is to be shown
                for (var alt of aList)
                    if ( !(
                        (!alt.cond || alt.cond()) 
                        && (!alt.patt || val != N && (RRE = alt.patt.RE.exec(val)))
                        ) == alt.not)
                    { cAlt = alt; break }
            }
            catch (m) { throw alt.n==srcE ? m : ErrM(alt.n, m); }
            finally {
                if (bH) {
                    // In this CASE variant, all subtrees are kept in place, some are hidden
                    for (let alt of aList) {
                        let {r, sub, cr} = PrepElm(ar, 'WHEN');
                        if ( !(r.n.hidden = alt != cAlt) && !bR
                            || cr
                        )
                            await alt.b(sub);
                    }
                    pN = ar.pN;
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
                            );

                        await cAlt.b(sub);
                    }
                }
            }
        }
    }


    private CFor(srcE: HTMLElement, ats: Atts): Promise<DOMBuilder> {

        // Three unknown but distinguished types, used by the <FOR> construct
        interface Item {}   // Iteration items
        interface Key {}    // Iteration keys
        interface Hash {}   // Iteration hash values

        // A ForRange is a range with extra props to hold FOR iteration info
        interface ForRange extends Range {
            pv?: ForRange;      // Previous range, for we want FOR ranges doubly linked
            nx: ForRange;       // Next range is a ForRange too
            key?: Key;          // Key value
            hash?: Hash;        // Hash value
            mov?: booly;        // Used while reordering ranges, to mark ranges to be moved
            rv?: RV<Item>;    // When reactive, the created RVAR for the current item
            ix?: RV<number>;  // Index number
        }
        // We'll start with collecting the following item information
        type ItemInfo = {item:Item, key: Key, hash:Hash[], ix: number};

        let letNm = ats.g('let')
        ,   ixNm = ats.g('index',F,F,T) || ats.g('rindex',F,F,T)
            ;
        this.rt = F;

        if (letNm != N) { /* A regular iteration */
            let dOf =
                this.CAttExp<Iterable<Item> | Promise<Iterable<Item>>>(ats, 'of', T)
            ,   pvNm = ats.g('previous',F,F,T)
            ,   nxNm = ats.g('next',F,F,T)
            ,   dUpd = this.CAttExp<RV>(ats, 'updates')
            ,   bRe: booly = ats.gB('reacting') || ats.gB('reactive') || dUpd
                ;

            return this.Framed(async SF => {
                // Add the loop-variable to the context, and keep a routine to set its value
                let vLet = this.LV(letNm)
                // The same for 'index', 'previous' and 'next' variables
                ,   vIx = this.LV<RV<number>>(ixNm)
                ,   vPv = this.LV<Item>(pvNm)
                ,   vNx = this.LV<Item>(nxNm)
                ,   dKey = this.CAttExp<Key>(ats, 'key')
                ,   dHash = this.CAttExps<Hash>(ats, 'hash')
                
                // Compile all childNodes
                ,   b = await this.CIter(srcE.childNodes)
                ;
                // Dit wordt de runtime routine voor het updaten:
                // bR = update root only
                return b && async function FOR(ar: Area /* , bR: booly */ ) {
                    let iter: Iterable<Item> | Promise<Iterable<Item>>
                            = dr(dOf()) || E
                    ,   {r, sub} = PrepRng<{v:Map<Key, ForRange>}>(ar, srcE, Q)
                    ,   {pN} = sub
                    ,   bfor = sub.bfor !== U ? sub.bfor : r.Nxt
                    ,   sEnv = {env, oes}
                    ,   pIter = async (iter: Iterable<Item>) => {
                            ({env, oes} = sEnv);                            

                            // Map of the current set of child ranges
                            let 
                                si: booly =
                                    // Check for being iterable
                                    Symbol.iterator in iter
                                    || (Symbol.asyncIterator in iter ? arChk() 
                                        : thro(`[of] Value (${iter}) is not iterable`)
                                    )
                            ,   kMap: Map<Key, ForRange> = r.v ||= new Map

                            // Map of the newly obtained data
                            ,   nMap = new Map<Key, ItemInfo>

                            // First we fill nwMap, so we know which items have disappeared, and can look ahead to the next item.
                            // Note that a Map remembers the order in which items are added.
                            ,   ix=0
                            ,   {EF} = SF(N, <Range>{})
                            ,   ci = (item: Item) => {
                                    // Set bound variables, just to evaluate the 'key' and 'hash' expressions.
                                    // Later on, we set them again.
                                    vLet(item);
                                    vIx(<any>ix);
                                    let hash = dHash?.()
                                    ,   key = dKey?.() ?? hash?.[0];
                                    if (key != N && nMap.has(key))
                                        throw `Duplicate key '${key}'`;

                                    nMap.set(key ?? {}, {item, key, hash, ix: ix++});
                                }
                            try {
                                if (si)
                                    for (let i of iter) ci(i);
                                else
                                    for await (let i of iter) ci(i);
                            }
                            finally { EF() }
                            
                            arChk();

                            // Now we will either create or re-order and update the DOM
                            let L = nMap.size, x: number
                            ,   nxR = <ForRange>r.ch    // This is a pointer into the created list of child ranges
                            ,   bf: ChildNode
                            ,   iter2 =  nMap.values()
                            ,   nxIR = iter2.next()       // Next iteration result
                            ,   prIt: Item
                            ,   prR: Range
                            ,   k: Key
                            ,   EC = ()=>{
                                    // Erase childranges at the current point with a key that is not in 'nwMap'
                                    while (nxR && !nMap.has(k = nxR.key)) {
                                        if (k != N)
                                            kMap.delete(k);
                                        nxR.erase(pN);
                                        if (nxR.rv)
                                            nxR.rv.$subs.delete(nxR);
                                        nxR.pv = N;
                                        nxR = nxR.nx;
                                    }
                                    bf = nxR?.FstOrNxt || bfor;
                                }
                            sub.pR = r;
                            while(!nxIR.done) {
                                EC();
                                // Inspect the next item
                                let {item, key, hash, ix} = <ItemInfo>nxIR.value
                                    // See if it already occured in the previous iteration
                                ,   chR = kMap.get(key)
                                ,   cr = !chR
                                ,   chAr: Area;

                                if (cr) {
                                    // Range has to be newly created
                                    sub.r = N;
                                    sub.prR = prR;
                                    sub.bfor = bf;
                                    ({r: chR, sub: chAr} = PrepRng(sub));
                                    if (key != N)
                                        kMap.set(key, chR);
                                    chR.key = key;
                                }
                                else {
                                    // Item already occurs in the series; chR points to the respective child range
                                    while (nxR != chR)
                                    {
                                        if (!chR.mov) {
                                            // Item has to be moved; we use two methods
                                            if ( (x = nMap.get(nxR.key).ix - ix) * x > L) {
                                                // Either mark the range at the current point to be moved later on, and continue looking
                                                nxR.mov = T;
                                                
                                                nxR = nxR.nx;
                                                EC()
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
                                            pN.insertBefore(n, bf);
                                        chR.mov = F;
                                        chR.nx = nxR;
                                        break;
                                    }

                                    nxR = chR.nx;
                                    sub.r = chR;

                                    // Prepare child range
                                    chAr = PrepRng(sub).sub;

                                    sub.pR = N;
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
 
                                // Environment instellen
                                let {sub: iSub, EF} = SF(chAr, chR)
                                ,   rv = chR.rv;
                                try {
                                    // Set bound variables

                                    if(ixNm)
                                        vIx(chR.ix ||= new RV<number>) .V = ix;

                                    if (bRe)
                                        if(rv)
                                            (vLet(rv) as RV).$V = item;
                                        else
                                            // Turn 'item' into an RVAR
                                            vLet(chR.rv = RVAR(N,item,N,N,N, dUpd?.()));                                    
                                    else
                                        vLet(item);

                                    vPv(prIt);
                                    vNx( (<ItemInfo>nxIR.value)?.item );

                                    
                                    // Does current range need building or updating?
                                    if (cr || !hash || hash.some((h,i) => h != chR.hash[i])
                                    )
                                        if (rv)
                                            AJ(rv);
                                        else 
                                        {   // Build
                                            await b(iSub);

                                            // Subscribe the range to the new RVAR_Light
                                            chR.rv?.$SR(iSub, b, chR.ch);
                                        }
                                }
                                finally { EF(); }

                                chR.hash = hash;
                                prIt = item;
                            }
                            EC();
                            if (prR) prR.nx = N; else r.ch = N;
                        };

                    //arChk();
                            
                    if (iter instanceof Promise)
                        // The iteration is a Promise, so we can't execute the FOR just now, and we don't want to wait for it.
                        iter.then(it => AJ({Exec: () => pIter(it)}) , sEnv.oes.e)
                    else
                        await pIter(iter);
                };
            });
        }
        else { 
            /* Iterate over multiple slot instances */
            let nm = ats.g('of',T,T).toUpperCase()
            ,   {S,dC} = this.CT.getCS(nm) ||
                    // Slot doesn't exist; it's probably a missing 'let'
                    thro(`Missing attribute [let]`);
            
            return this.Framed(
                async SF => {
                    let vIx = this.LV(ixNm)
                    ,   DC = this.LCons([S])
                    ,   b = await this.CChilds(srcE)
                    
                    return b && async function FOREACH_Slot(ar: Area) {
                        let {tmps, env} = dC()
                        ,   {EF, sub} = SF(ar)
                        ,   i = 0
                        ;
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

    //#region Components and instances

    // Compile a <COMPONENT> definition
    private async CComp(srcE: HTMLElement, ats: Atts): Promise<DOMBuilder> {

        let bRec = ats.gB('recursive')
        ,   {hd, ws} = this
        ,   eStyles = ats.gB('encapsulate')
                // When encapsulation is requested, then eStyles becomes an HTMLCollection into which all static stylesheets are collected
                && (this.hd = D.createDocumentFragment()).children
            // These are all child elements
        ,   arr = Array.from(srcE.children) as Array<HTMLElement>
            // The first child element should be the signature
        ,   eSig = arr.shift() || thro('Missing signature(s)')
            // The last child element should be the template
        ,   eTem = arr.pop()
            // Check its tagName
        ,   t = /^TEMPLATE(S)?$/.exec(eTem?.tagName) || thro('Missing template(s)')
            // There may be multiple components, each having a signature and a definition
        ,   sigs: Array<Signat> = []
        ,   CDefs: Array<ConstructDef> = [];

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
            ,   ES = this.SS()
            ,   b = this.ErrH(
                        await this.CIter(arr)
                        , srcE, T)
                    || dB
            ,   mapS = new Map<string, Signat>(mapI(sigs, S => [S.nm, S]));

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
            
            await b(ar);
        };
    }


    // Compile a construct template
    // Used: 1. when compiling a <COMPONENT> definition
    //       2. When compiling named slot definitions inside a construct instance
    //       3. When compiling the remaining content of a construct instance, to fill the content slot
    private CTempl(
        S: Signat                   // The construct signature
    ,   srcE: HTMLElement         // Source element, for error messages
    ,   bSlot?: boolean         // When true, naming bound variables is compulsory
    ,   ats?: Atts
    ,   body: ParentNode = srcE
    ,   eStyles?: Iterable<Node>   // When supplied, use shadow-dom to encapsulate the output and copy these style nodes
    ): Promise<Template>
    {
        return this.Framed(async SF => {
            this.ws = this.rt = WSpc.block;
            let atts = ats || new Atts(srcE)
            // Local variables to contain the attribute values.
            // Note that the attribute name 'nm' may be different from the variable name.
            ,   lvars: Array<[string, LVar]> =
                    S.Pams.map(
                        ({mode,nm}) => {
                            let lnm = atts.g(nm) ?? atts.g(mode + nm);
                            return [nm, this.LV(lnm || (lnm === Q || !bSlot ? nm : N) )];
                        }
                    )
            ,   DC = this.LCons(S.Slots.values())
            ,   b  = await this.CIter(body.childNodes)
                ;
            ats || atts.None();

            // Routine to instantiate the template
            return b && async function TEMPL(
                args: ArgSet                        // Arguments to the template
                , mSlots: Map<string, Template[]>   // Map of slot templates
                , env: Environment                 // Environment to be used for the slot templates
                , ar: Area
            ) {
                // Handle defaults, in the constructdef environment,
                if (!ar.r)
                    for (let {nm, pDf} of S.Pams)
                        if (pDf && args[nm] === U)
                            args[nm] =  pDf();
                
                ro = F;
                
                // Start frame
                let {sub, EF} = SF(ar);

                // Set parameter values in the new frame
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
                    let {r: {n}, sub: s, cr} = 
                            PrepElm(sub
                                , /^[A-Z].*-/.test(S.nm) ? S.nm : 'RHTML-'+S.nm)
                    ,   SR = s.pN = n.shadowRoot || n.attachShadow({mode: 'open'})
                    ;
                    if (cr)
                        for (let sn of eStyles)
                            SR.appendChild(sn.cloneNode(T));
                    
                    sub = s;
                }
                await b(sub).finally(EF);
                pN = ar.pN;
            }
        }).catch(m => { throw `<${S.nm}> template: ` + m; });
    }

    // Compile a construct instance, given its signature and definition
    private async CInst(
        srcE: HTMLElement, ats: Atts,
        {S, dC}: {S: Signat, dC: DepE<ConstructDef>}
    ) {
        await S.task;       // Wait for signature to be fetched (when sync imported)
        let {RP, CSlot, Slots} = S

            // Each specified parameter will be compiled into a triple containing:
        ,   gArgs: Array<{
                nm: string,             // The parameter name
                G: Dep<unknown>,       // A getter routine
                S?: Dep<Handler>,      // A setter routine, in case of a two-way parameter
                bT?: booly,             // 
            }> = []
        ,   SBldrs = new Map<string, Template[]>(
                mapI(Slots, ([nm]) => [nm, []])
            )
        ;
        for (let {mode, nm, rq} of S.Pams)
            if (nm!=RP) {
                let {G,S} = this.cAny(ats, nm, rq);
                //if (S && mode!='@') throw ``
                mode=='@' && !S && (S=K(F));
                if (G)
                    gArgs.push( {nm,G,S} );
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
            let {af} = this.CAtts(ats, T); // Don't distinguish between before and after; everything goes after
            ro=T;
            gArgs.push({
                nm: RP, 
                G: () => <RestArg>{ms: af, xs: af.map(evM)}
            });
            ro=F;
        }
        
        this.ws = WSpc.inline;

        return async function INST(ar: Area, bR:booly) {
            let {r, sub, cr} = PrepRng<{args: ArgSet}>(ar, srcE)
            ,   sEnv = env
            ,   cdef = dC()
            ,   args = r.args ||= {__proto__:N}
            ;
            if (cdef)  //Just in case of an async imported component where the client signature has less slots than the real signature
                try {
                    ro = T;
                    for (let {nm, G, S} of gArgs) {
                        let v = G();
                        if (!S 
                            || v instanceof RV  // For one-way parameters, do not dereference
                            ) {
                            // when a one-way parameter changes, then update the whole instance
                            bR &&= v == args[nm];
                            
                            args[nm] = v;
                        }
                        else if (cr)
                            // For TWO-way parameters, create an RVAR
                            (args[nm] as RV) = RVAR(U,v,U,S());
                        else
                            (args[nm] as RV).V = v;
                    }
                    arChk();
                    env = cdef.env;

                    if (cr || !bR)
                        for (let tmpl of cdef.tmps) 
                            await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {env = sEnv; ro = F;}
        }
    }
    //#endregion

    private async CHTML(srcE: HTMLElement, ats: Atts
        ,   dTag?: Dep<string>    // Optional routine to compute the tag name
    ) {
        // Compile a regular HTML element
        // Remove trailing dots
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, Q)
        // Remember preceeding whitespace-mode
        ,   preWs = this.ws
        // Whitespace-mode after this element
        ,   postWs: WSpc;

        if (this.sPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
            this.ws = WSpc.preserve; postWs = WSpc.block;
        }
        else if (rBlock.test(nm))
            this.ws = this.rt = postWs = WSpc.block;
        
        else if (rInline.test(nm)) {  // Inline-block
            this.ws = this.rt = WSpc.block;
            postWs = WSpc.inline;
        }
        
        if (preWs == WSpc.preserve)
            postWs = preWs;

        // We turn each given attribute into a modifier on created elements
        let {bf,af} = this.CAtts(ats, nm=='SELECT')

        // Compile the given childnodes into a routine that builds the actual childnodes
        ,   b = await this.CChilds(srcE)
        ,   {lscl,ndcl}= this  // List of scoping-classnames to be added to all instances of this source element

        if (postWs)
            this.ws = postWs;

        if (nm=='A' && this.S.bAutoReroute && bf.every(({nm}) => nm != 'click')) // Handle bAutoReroute
            af.push({mt: MType.AutoReroute, d: dU, cu : 1 });

        bf.length || (bf=U);
        af.length || (af=U);

        // Now the runtime action
        return async function ELM(ar: Area, bR: booly) {
                let {r, sub, cr} = 
                    PrepElm<ModifierData>(
                        ar,
                        nm || dTag()
                    )
                ,   k = bf && ApplyAtts(r, cr, bf)
                ,   xs = (ro=af)?.map(evM);
                ro = F;
                //arCheck();

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
                
                af && ApplyAtts(r, cr, af, k, xs);

                pN = ar.pN;
            };
    }

    private CAtts(ats: Atts, bAf?: booly) {
        // Compile attributes into an array of modifiers

        let bf: Modifier[] = []
        ,   af: Modifier[] = []
        ,   k = 0
        ,   m: RegExpExecArray
        ,   ap = this.S.bAutoPointer

        ,   addM =
            (mt: MType, nm: string
                , d: Dep<unknown> & {fx?: string}
                , cu?: CU  // Has this modifier to be executed on create / update / both
                , ev?: string
            ) => {
                let M: Modifier = 
                    {mt, nm, d
                        , cu: cu ||
                            // When the attribute value is a string constant, then it need only be set on create
                            (d.fx != N ? 1 : 3)
                        , ev
                    };
                if (ap && mt == MType.Event) M.ap = nm == 'click';
                if (mt == MType.Src) M.fp = this.fp;

                // Either the 'before' or 'after' list
                (mt >= MType.RestParam || bAf ? af : bf).push(M);
                k++;
                return M;
            };

        for (let [A, V] of ats)
            if (m = /^(?:(([#+.](#)?)?(((class|classname)|style)(?:[.:](\w+))?|on(\w+)\.*|(src(set)?)|(\w*)\.*))|([\*\+#!]+|@@?)(\w*)|\.\.\.(\w+))$/.exec(A)) 
            //           op     h-h p dyc---------------c     -y       i---id    e---e    s-  ss-ss s a---a   -o t-------------tw---w       r---r
            {
                let [,o,p,h,d,y,c,i,e,s,ss,a,t,w,r] = m;
                if (o) {
                    // One-way attributes/properties/handlers
                    let dV = p ? this.CExpr(V, A)
                            : e ? this.CHandlr(V, A)
                            : this.CText(V, A)
                    ,   aa: string
                    ;
                    if (aa = a == 'shown' ? 'hidden' 
                         : a == 'enabled' ? 'disabled' : N) {
                        a = aa;
                        dV = B((b : booly) => !b, dV);
                    }
                    if (a == 'visible') {
                        // set #style.visibility
                        i = 'visibility';
                        dV = B((b: booly) => b ? N : 'hidden', dV);
                    }
                    addM(
                        c ? MType.ClassNames
                        : i ? MType.StyleProp
                        : y ? MType.Style
                        : e ? MType.Event
                        : s ? MType.Src
                        : p ? d ? MType.Prop : MType.SetProps
                        : MType.Attr

                        , i || a || e || d

                        , i && c 
                            ? () => Object.fromEntries([[i, dV()]]) // Treat '#class.name = V' like '#class = {name: V}'
                            : dV

                        // Undocumented feature: when the source attribute contains a DOUBLE hash,
                        // then the modifier is executed only on create
                        , (e && !p || h) && 1
                        , ss
                        );
                }
                else if (t) {
                    // Two-way properties
                    // #, ##, *, !, !!, combinations of these, @ = #!, @@ = #!!, @# = ##!, @@# = ##!!
                    let mP = /[@#](#)?/.exec(t)
                    ,   mT = /([@!])(\1)?/.exec(t)
                    ,   cu: CU = <any>/\*/.test(t) 
                                + <any>/\+/.test(t) * 2               
                    ,    {G,S} = this.cTwoWay(V, w, mT||cu )
                    ;
                    // Set prop value
                    (mP ? addM(MType.Prop, w, G, mP[1] && 1) : <Modifier>{})
                    .T =
                        // Get on change or input
                        mT && addM(MType.Target, w, S, 1, mT[2] ? 'change' : 'input')
                    ;
                    // Get on create and/or update
                    cu && addM(MType.GetProp, w, S, cu);
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
        // Regular expression to recognize string interpolations, with or without dollar,
        // with support for threeo levels of nested braces,
        // where we also must take care to skip js strings possibly containing braces,  escaped quotes, quoted strings, regexps, backquoted strings containing other expressions.
        // Backquoted js strings containing js expressions containing backquoted strings might go wrong
        // (We can't use negative lookbehinds; Safari does not support them)
        let f = (re:string) => 
`(?:\\{(?:\\{${re}\\}|[^])*?\\}\
|'(?:\\\\.|[^])*?'\
|"(?:\\\\.|[^])*?"\
|\`(?:\\\\[^]|\\\$\\{${re}}|[^])*?\`\
|/(?:\\\\.|\[]?(?:\\\\.|.)*?\])*?/\
|[^])*?`
        ,   rIS = this.rIS ||= 
                new RegExp(
                    `\\\\([{}])|\\$${this.S.bDollarRequired ? Q : '?'}\\{\\s*(${f(f(f('[^]*?')))})\\}|$`
                    , 'g'
                )
        ,   gens: Array< string | Dep<unknown> > = []
        ,   ws: WSpc = nm || this.S.bKeepWhiteSpace ? WSpc.preserve : this.ws
        ,   fx = Q
        ,   iT: booly = T         // truthy when the text contains no nonempty embedded expressions
        ;
        rIS.lastIndex = 0
        while (T) {
            let lastIx = rIS.lastIndex, m = rIS.exec(text);
            // Add fixed text to 'fx':
            fx += text.slice(lastIx, m.index) + (m[1]||Q)
            // When we are either at the end of the string, or have a nonempty embedded expression:
            if (!m[0] || m[2]) {
                if (ws < WSpc.preserve) {
                    // Whitespace reduction
                    fx = fx.replace(/[ \t\n\r]+/g, " ");  // Reduce all whitespace to a single space, except nonbreakable space &nbsp;
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
                                s += typeof g == 'string' ? g : g()?.toString() ?? Q;                
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
        ,   rP =
            /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\[^])|\[\^?(?:\\[^]|[^\\\]])*\]|$/g;

        while (rP.lastIndex < patt.length) {
            let ix = rP.lastIndex
            ,   m = rP.exec(patt)
            ,   lits = patt.slice(ix, m.index);

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

    private CPam<T = unknown>(ats: Atts, at: string, bReq?: booly): Dep<T> 
    // Compile parameter (of some OtoReact construct) 
    {
        let txt = ats.g(at);
        return (
            txt == N ? this.CAttExp<T>(ats, at, bReq)
            : /^on/.test(at) ? this.CHandlr(txt, at) as Dep<any>
            : this.CText(txt, at) as Dep<any>
        );
    }
    private CAttExp<T>(ats: Atts, at: string, bReq?: booly
        ) {
        return this.CExpr<T>(ats.g(at, bReq, T), '#'+at, U);
    }

    private cAny<T = unknown>(ats: Atts, nm: string, rq?: booly)
        : {G: Dep<T>, S?: Dep<(v:T) => void>}
    {
        let exp = ats.g('@' + nm);
        return exp != N ? this.cTwoWay(exp, '@'+nm)
            : {
                G: this.CPam(<Atts>ats, nm, rq)
            };
    }

    private cTwoWay<T = unknown>(exp: string, nm: string, bT: booly=T) {
        return {
            G: this.CExpr<T>(exp, nm),
            S: bT && this.CRout<T>(`(${exp})=$` , '$', `\nin assigment target "${exp}"`)
        };
    }
    
    private CHandlr(
        txt: string
    ,   nm: string
    ): DepE<(v: Event) => any> {
        return /^#/.test(nm) ?
            this.CExpr(txt, nm, txt)
            : this.CRout(txt, 'event', `\nat ${nm}="${Abbr(txt)}"`);

    }

    private CRout<V>(
        txt: string
    ,   x: string
    ,   e: string): DepE<(v: V) => any> {
        let ct = this.gsc(txt)
        ,   C = TryV(`${US}(function(${x},${ct}){${txt}\n})`, e, Q)
        return (e: Environment = env) =>
                function($) {
                    try { return C.call(this,$,e); }
                    catch(m) {throw m+e;}
                };
    }

    public CExpr<T>(
        e: string           // Expression to transform into a function
    ,   nm?: string             // To be inserted in an errormessage
    ,   src: string = e    // Source expression
    ,   dl: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
    ): Dep<T> {
        if (e == N)
            return <null>e;  // when 'e' is either null or undefined, return the same
        
        e.trim() || thro(`${nm}: Empty expression`);
        
        var m = '\nat ' + (nm ? `${nm}=` : Q) + dl[0] + Abbr(src) + dl[1] // Error text
        ,   f = TryV(
                `${US}(function(${this.gsc(e)}){return(${e}\n)})`  // Expression evaluator
                , m, Q
            ) as (e:Environment) => T
            ;
        return () => {
                try { 
                    return f.call(pN, env);
                } 
                catch (e) {throw e+m; } // Runtime error
            };
    }

    private CAttExps<T>(ats: Atts, attNm: string): Dep<T[]> {
        let L = ats.g(attNm, F, T);
        if (L==N) return N;
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
    private gURL(src: string) {
        return new URL(src, this.fp).href
    }
    // Returns the normalized form of URL 'src' without file name.
    private GetP(src: string) {
        return this.gURL(src).replace(/[^/]*$/, Q);
    }

    // Fetches text from an URL
    async FetchText(src: string): Promise<string> {
        return (
            await RFetch(this.gURL(src), {headers: this.S.headers})
        ).text();
    }

    // Fetch an RHTML module, either from a <MODULE id> element within the current document,
    // or else from an external file
    async fetchM(src: string): Promise<Iterable<ChildNode>> {
        let m = this.doc.getElementById(src);
        if (!m) {
            // External
            let {head,body} = P.parseFromString(await this.FetchText(src), 'text/html') as Document
            ,   e = body.firstElementChild as HTMLElement
            ;
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
    constructor(public elm: HTMLElement) {
        super();
        for (let a of elm.attributes)
            if (!/^_/.test(a.name)) // Ignore attributes starting with '_'
                super.set(a.name, a.value);
    }

    // Get an attribute value, optionally with hash, and remove it from the set
    public g(
        nm: string         // Name
    ,   bReq?: booly       // Is the attribute required
    ,   bHash?: booly      // Is an optional hashtag allowed
    ,   bI?: booly          // If it is specified without value, should the attribute name be treated as its implicit value
    ) {
        let m: string
        ,   gg = (nm:string) => {
                let v= super.get(m = nm);
                return v!=N ? v : 
                    // Undocumented feature: compile-time expression evaluation
                    TryV(super.get(m = '%'+nm), m);
            }
        ,   v = gg(nm)
        ;
        if (v==N && bHash)
            v = gg('#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute '` + nm + `'`;
        return bI && v == Q ? nm : v;
    }

    // Get a compile-time boolean attribute value
    // If the attribute is specified without value, it is treated as "true".
    public gB(nm: string, df: boolean = F): boolean { 
        let v = this.g(nm)
        ,   m = /^((false|no)|true|yes)?$/i.exec(v)
        ;
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
//#endregion

//#region Utilities
const
    dU: DepE<any>     = _ => U             // Undefined dependent value
,   dB: DOMBuilder  = async (ar) => {PrepRng(ar);}       // A dummy DOMBuilder

    // Elements that trigger block mode; whitespace before/after/inside is irrelevant
,   rBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|[OU]L|P|TABLE|T[RHD]|PRE)$/ // ADDRESS|FIELDSET|NOSCRIPT|DATALIST
,   rInline = /^(BUTTON|INPUT|IMG|SELECT|TEXTAREA)$/     // Elements that trigger inline mode before/after

    // Routine to add a class name to all selectors in a style sheet
,   AddC = (txt: string, nm: string) =>
        nm ? txt.replaceAll(
/{(?:{.*?}|.)*?}|@[msd].*?{|@[^{;]*|(?:\w*\|)?(\w|[-.#:()\u00A0-\uFFFF]|\[(?:(['"])(?:\\.|.)*?\2|.)*?\]|\\[0-9A-F]+\w*|\\.|(['"])(?:\\.|.)*?\3)+/gsi,
//                                  1                                        2----2                                        3----3             1
                (m,p) => p ? `${m}.${nm}` : m
            )
        : txt

    // Capitalized propnames cache
,   Cnms: {[nm: string]: string} = {__proto__:N}

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

// Abbreviate text
, Abbr = (s: string, m: number=65) =>
    s.length > m ?
        s.slice(0, m - 3) + "..."
        : s

// Setting multiple LVars at once
, SetLVs = (vars: Array<LVar>, data: Array<unknown>) =>
    vars.forEach((v,i) => v(data[i]))

// Add an object 'o' having a name 'o.nm' to a map
, mapNm = <OT extends {nm: string}>(m: Map<string, OT>, o:OT) =>
    m.set(o.nm, o)

// Either add or delete a value to a map
, mapSet = <V>(m: Map<string, V>, nm: string, v:V) =>
    v!=N ? m.set(nm, v) : m.delete(nm)

, ErrM = (elm: HTMLElement, e: string=Q, maxL?: number): string =>
    e + `\nat ${Abbr(/<[^]*?(?=>)/.exec(elm.outerHTML)[0], maxL)}>`

// Create an error DOM node
, crErrN = (m: string) => 
    ass(D.createElement('div')
        , { style: 'color:crimson;font-family:sans-serif;font-size:10pt'
            , innerText: m})

// Check that some element has no nonblank content
, NoChilds = (srcE: HTMLElement) => {
    for (let n of srcE.childNodes)
        if ( n.nodeType == 1         //Node.ELEMENT_NODE
            || n.nodeType == 3       //Node.TEXT_NODE 
                && n.nodeValue.trim()
            )
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
}

// Scroll to hash: scroll the element identified by the current location hash into view, after the DOM has been updated
, S2Hash = () =>
    L.hash && setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6)
;

// Map an iterable to another iterable, for items satisfying an optional condition
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
export function range(from: number, count?: number, step: number = 1) {
    if (count === U) {
        count = from;
        from = 0;
    }
    // In case some arguments are RVARs, we want to coerce them into number immediately.
    //If we did the coercion within the iterator function, it would be delayed, and OtoReact wouldn't mark the RVARs as used.
    return (
        function*(f:number,c:number,s:number) {
            for (let i=0;i<count;i++) {
                yield from;
                from += step;
            }
        }
    )(Number(from),Number(count),Number(step))
}

// Fetch an URL with error handling
export async function RFetch(input: RequestInfo, init?: RequestInit) {
    try {
        let rp = await fetch(input, init);
        if (!rp.ok)
            throw `Status ${rp.status} ${rp.statusText}`;
        return rp;
    }
    catch (e) {
        throw `${init?.method||'GET'} ${input}: ` + e;
    }
}
//#endregion

//#region Routing
class DL extends RV<URL>{
    query: {[fld: string]: string};
    constructor() {
        super(new URL(L.href));

        // Let the RV react on user-triggered browser-URL changes
        W.addEventListener('popstate', _ => this.U.href = L.href );
        // Let the browser URL react on RV-changes
        this.Subscribe(url => {
            url.href == L.href || history.pushState(N, N, url.href);    // Change URL withour reloading the page
            S2Hash(); // Scroll to hash, even when URL remains the same
        });

        this.query = <any>new Proxy<DL>(this, {
            get( rl, key: string) { return rl.V.searchParams.get(key); }
            , set( rl, key: string, val: string) {
                if (val != rl.V.searchParams.get(key)) {
                    mapSet(rl.V.searchParams as any, key, val);
                    rl.SetDirty();
                }
                return T;
            }
       });
    }
    
    basepath: string = U;
    get subpath()  { return dL.pathname.slice(this.basepath.length); }
    set subpath(s) { dL.pathname = this.basepath + s; }

    search(key: string, val: string) {
        let U = new URL(this.V);
        mapSet(U.searchParams as any, key, val);
        return U.href;
    }
    RVAR(key: string, df?: string, nm: string = key) {
        let g = () => this.query[key]
        ,   rv = RVAR<string>(nm, g(), N, v => this.query[key] = v)
        ;
        this.Subscribe(_ => rv.V = g() ?? df, T);
        return rv;
    }
}

const dL = new Proxy( new DL, ProxH ) as DL & URL;
export const
    docLocation = dL
,   reroute: (arg: MouseEvent | string) => void = 
        arg => {
            if (typeof arg == 'object') {
                if (arg.ctrlKey)
                    return;
                arg.preventDefault();
                arg = (arg.currentTarget as HTMLAnchorElement).href;
            }
            dL.V = new URL(arg, L.href);
        };
//#endregion

let _ur = import.meta.url
,   R: RComp;
if (G._ur) {alert(`OtoReact loaded twice,\nfrom: ${G._ur}\nand: ${_ur}`); throw Q;}

// Define global constants
ass(G, {
        RVAR, range, reroute, RFetch, DoUpdate, docLocation
        , debug: Ev('()=>{debugger}')
        , _ur
});

export async function RCompile(srcN: HTMLElement & {b?: booly}, setts?: string | Settings): Promise<void> {
    if (srcN.isConnected && !srcN.b)   // No duplicate compilation
        try {            
            if (typeof setts == 'string')
                setts = <Settings>TryV(`({${setts}})`, `settings '${setts}'`);

            srcN.b = T;   // No duplicate compilation

            let m = L.href.match(`^.*(${setts?.basePattern || '/'})`)
            ,   C = new RComp(
                    N
                    , L.origin + (dL.basepath = m ? new URL(m[0]).pathname.replace(/[^/]*$/, Q) : Q)
                    , setts
                )
            ;
            /*
            if (!setts.bGlobs)
                for (let g of Object.keys(globs))
                    C.LV(g);
            */
            await C.Compile(srcN);

            // Initial build
            srcN.innerHTML = Q;
            AJ({Exec: () =>
                C.Build({
                    pN: srcN.parentElement,
                    srcN,           // When srcN is a non-RHTML node (like <BODY>), then it will remain and will receive childnodes and attributes
                    bfor: srcN      // When it is an RHTML-construct, then new content will be inserted before it
                }).then(S2Hash).finally(() => {srcN.hidden = F;})
            });
        }
        catch (e) {    
            alert(`OtoReact compile error: ` + Abbr(e, 1000));
        }
}

export async function DoUpdate() {
    if (Jobs.size && !env) {
        env = E;
        nodeCnt = 0;
        let u0 = upd;
        start = now();
        while (Jobs.size) {
            let J = Jobs;
            Jobs = new Set;
            //if (upd++ - u0 > 15) debugger
            if (upd++ - u0 > 25)
            { alert('Infinite react-loop'); break; }
            for (let j of J)
                await j.Exec();
        }
        if (nodeCnt)
            R?.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        env=U;
    }
    hUpd = N;
}

// Close registered child windows on page hide (= window close)
W.addEventListener('pagehide', () => chWins.forEach(w=>w.close()));

// Initiate compilation of marked elements
setTimeout(() => 
    (D.querySelectorAll('*[rhtml]') as NodeListOf<HTMLElement>)
    .forEach(src => RCompile(src, src.getAttribute('rhtml')))  // Options
, 0);