// Global settings 
const
    U = undefined, N = null, T = true, F = false, E = [], W = window,
    defaultSettings = {
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
    },
    parser = new DOMParser(),
    gEval = eval, gFetch=fetch;

// Type used for truthy / falsy values
type booly = boolean|string|number|object;

// Current whitespace mode of the compiler:
const enum WSpc {
    block = 1,      // We are in block mode; whitespace is irrelevant
    inlineSpc,      // We are in inline mode with trailing whitespace, so more whitespace can be skipped
    inline,         // We are in inline mode, whitespace is relevant
    preserve        // Preserve all whitespace
}

// Polyfill for globalThis
W.globalThis || ((W as any).globalThis = W.self);

// A DOMBUILDER is the semantics of a piece of RHTML.
// It can both build (construct, create) a new piece of DOM, and update an existing piece of DOM.
type DOMBuilder = ((reg: Area, ...args) => Promise<void>) 
    & {
        ws?: boolean; 
        auto?: boolean; // When true, the DOMBuilder will create an RVAR that MIGHT need auto-subscribing.
        // The .value of the Range created by the DOMBuilder must be the RVAR.
    };


// An AREA is a (runtime) place to build or update, with all required information
type Area = {
    rng?: Range,              // Existing piece of DOM
    // When undefined/null, the DOM has to be CREATED
    // When defined, the DOM has to be UPDATED

    parent: Node;               // DOM parent node
    before?: ChildNode;         // DOM node before which new nodes are to be inserted

    /* When !rng: */
    source?: ChildNode;         // Optional source node to be replaced by the new DOM 
    parentR?: Range;            // The new range shall either be the first child of some range,
    prevR?: Range;              // Or the next sibling of some other range

    /* When rng: */
    bRootOnly?: boolean,        // true == just update the root node, not its children
                                // Used by 'thisreactson'.
}

// A RANGE is a piece of constructed DOM, in relation to the source RHTML.
// It can either be a single DOM node or a linked list of subranges.
// It is created by a builder, and contains all metadata needed for updating or destroying the DOM.
class Range<NodeType extends ChildNode = ChildNode> {
    node: NodeType;     // DOM node, in case this range corresponds to a single node
    
    child: Range;       // Linked list of child ranges (null=empty)
    next: Range;        // Next range in linked list

    parentR?: Range;    // Parent range
    parentN?: Node;     // Parent node, but only when this range has a different parent node than its parent range

    constructor(
        node: NodeType,
        area: Area,
        public text?: string,       // Description, used only for comments
    ) {
        this.node = node;
        if (area && !area.parentR?.node)
            this.parentR = area.parentR;
    }
    toString() { return this.text || this.node?.nodeName; }

    result?: any;   // Some result value to be kept by a builder
    value?: any;    // Some other value to be kept by a builder

    errNode?: ChildNode;  // When an error description node has been created, it is saved here, so it can be removed on the next update

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

    // Get first childnode IN the range
    public get First(): ChildNode {
        let f: ChildNode
        if (f = this.node) return f;
        let ch = this.child;
        while (ch) {
            if (f = ch.First) return f;
            ch = ch.next;
        }
    }
    
    // Get first node AFTER the range
    public get Next(): ChildNode {
        let r: Range = this, n: ChildNode, p: Range;
        do {
            p = r.parentR;
            while (r = r.next)
                if (n = r.First)
                    return n;
        } while (r = p)
    }

    public get FirstOrNext() {
        return this.First || this.Next;
    }

    // Enumerate all DOM nodes within this range, not including their children
    Nodes(): Generator<ChildNode> { 
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

    // Erase the range, i.e., destroy all child ranges and remove all nodes.
    // The range itself remains.
    erase(parent: Node) {
        let {node, child: ch} = this;
        if (node && parent) {
            parent.removeChild(node);
            parent = N; // No need to remove child nodes of this node
        }
        this.child = N;
        while (ch) {
            if (ch.bfDest)
                ch.bfDest.call(ch.node || parent);
            ch.erase(ch.parentN || parent);
            ch.parentR = N;
            if (ch.rvars)
                for (let rvar of ch.rvars)
                    rvar._Subs.delete(ch.subs);
            if (ch.onDest)
                ch.onDest.call(ch.node || parent);
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

function PrepArea(srcElm: HTMLElement, area: Area, text: string = '',
    nWipe?: 1|2,  // 1=wipe when result has changed; 2=wipe always
    result?: any,
) : {rng: Range, sub:Area, bCr: boolean}
{
    let {parent, rng} = area,
        sub: Area = {parent, rng: N }
        , bCr = !rng;
    if (bCr) {
        sub.source = area.source;
        sub.before = area.before;
        if (srcElm) text = srcElm.localName + (text && ' ') + text;
        
        UpdPrevRange(area, rng = sub.parentR = new Range(N, area, text));
        rng.result = result;
    }
    else {
        sub.rng = rng.child;
        area.rng = rng.next;

        if (nWipe && (nWipe==2 || result != rng.result)) {
            rng.result = result;
            rng.erase(parent); 
            sub.rng = N;
            sub.before = rng.Next;
            sub.parentR = rng;
            bCr = T;
        }
    }
    
    return {rng, sub, bCr};
}
function UpdPrevRange(area: Area, rng: Range) {
    let r: Range
    if (r = area.prevR) 
        r.next = rng;
    else if (r = area.parentR)
        r.child = rng;

    area.prevR = rng;
}
type RHTMLElement = HTMLElement & {
    handlers?: Array<{evType: string, listener: Handler}>
};
function PrepElm<T={}>(srcElm: HTMLElement, area: Area, nodeName = srcElm.nodeName): 
    {   rng: Range<RHTMLElement> & T
        , childArea: Area
        , bCr: boolean} {
    let rng = area.rng as Range<HTMLElement> & T, bCr = !rng;
    if (bCr) {
        rng = new Range(
            area.source == srcElm
                ? (srcElm.innerHTML = "", srcElm)
                : area.parent.insertBefore<HTMLElement>(document.createElement(nodeName), area.before)
            , area
            ) as Range<HTMLElement> & T;
        UpdPrevRange(area, rng);
    }
    else
        area.rng = rng.next
    return { 
        rng, 
        childArea: {
            parent: rng.node, 
            rng: rng.child, 
            before: N,
            parentR: rng
        },
        bCr
    };
}

function PrepCharData(area: Area, content: string, bComm?: boolean) {
    let rng = area.rng as Range<CharacterData>;
    if (!rng)
        UpdPrevRange(
            area
            , new Range(
                area.parent.insertBefore(
                    bComm ? document.createComment(content) : document.createTextNode(content)
                    , area.before)
                , area
            )
        );
    else {
        rng.node.data = content;
        area.rng = rng.next;
    }
}

type FullSettings = typeof defaultSettings;
type Settings = Partial<FullSettings>;
let childWins=new Set<Window>();

export async function RCompile(elm: HTMLElement = document.body, settings?: Settings): Promise<void> { 
    try {
        let {basePattern} = R.Settings = {...defaultSettings, ...settings},
            m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (
            docLocation.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : ''
        )
        await R.Compile(elm);

        // Initial build
        start = performance.now();
        builtNodeCnt = 0;
        let area: Area = {parent: elm.parentElement, source: elm, rng: N};
        await R.Build(area);
        W.addEventListener('pagehide', ()=>childWins.forEach(w=>w.close()));
        R.logTime(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        alert(`OtoReact error: `+err);
    }
}

type SavedContext = number;
function NewEnv(): Environment { 
    return addP([] as Environment, 'C', []);
}
function CloneEnv(env: Environment): Environment {
    return addP(Object.assign([], env), 'C', Object.assign([], env.C))
}
function assignEnv(target: Environment, source: Environment) {
    let C = Object.assign(target.C, source.C);;
    Object.assign(target, source);
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
    public RestParam: Parameter = N;
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
type ConstructDef = {nm: string, templates: Template[], CEnv?: Environment,
    Cnm?: string  // In case of a slot construct: the component name to which the slot belongs
};
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
        if (name) globalThis[name] = this;
        
        let s = store && store.getItem(this._sNm), t= initial;
        if (s != N)
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
    private get _sNm() {return this.storeName || `RVAR_${this.name}`}

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
        this.store.setItem(this._sNm, JSON.stringify(this._val));
    }

    toString() {
        return this._val.toString();
    }
}
export type RVAR<T = unknown> = _RVAR<T>;

export type RVAR_Light<T> = T & {
    _Subs: Set<Subscriber>;
    _UpdatesTo?: Array<RVAR>;
    Subscribe?: (sub:Subscriber) => void;
    store?: any;
    Save?: () => void;
    readonly U?: T;
};

        
function Subscriber({parent, bRootOnly}: Area, builder: DOMBuilder, rng: Range, ...args: any[] ): Subscriber {
    if (rng) rng.updated = updCnt;
    let sArea: Area = {
            parent, bRootOnly,
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

async function DoUpdate() {
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
                        catch (err) {
                            let msg = `ERROR: `+err;
                            console.log(msg);
                            alert(msg);
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
    updatesTo?: Array<RVAR>,
): RVAR_Light<T> {
    if (!t._Subs) {
        t._Subs = new Set();
        t._UpdatesTo = updatesTo;
        Object.defineProperty(t, 'U',
            {get:
                () => {
                    if (!bRO) {
                        DirtyVars.add(t);
                        if (t._UpdatesTo?.length)
                            for (let rvar of t._UpdatesTo)
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
    cnm?: string
    depV: Dependent<unknown>,
}
type RestParameter = Array<{M: Modifier, value: unknown}>;
let bRO: boolean = F;

function ApplyMod(elm: RHTMLElement, M: Modifier, val: unknown, bCr: boolean) {
    let {mt, nm, cnm} = M;
    function checkNm() {
        if (!cnm)
            M.cnm=M.nm=nm=CheckNm(elm, nm);
    }
    switch (mt) {
        case MType.Attr:
            elm.setAttribute(nm, val as string); 
            break;
        case MType.Src:
            elm.setAttribute('src',  new URL(val as string, nm).href);
            break;
        case MType.Prop:
            checkNm();
            if (val===U && typeof elm[nm]=='string') val = '';
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case MType.Event:
            checkNm();
            let m: RegExpMatchArray;
            if (val)
                if(m = /^on(input|change)$/.exec(nm)) {
                    elm.addEventListener(m[1], val as Handler);
                    elm.handlers.push({evType: m[1], listener: val as Handler})
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
        this.Settings   = RC ? {...RC.Settings} : {...defaultSettings};
        RC ||= this;
        this.FilePath  = FilePath || RC.FilePath;
        this.doc = RC.doc || document
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
        Object.assign(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.mPreformatted.add(tag.toLowerCase());
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

    private mPreformatted = new Set<string>(['pre']);

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
            , arr = Array.from(iter), L = arr.length
            , i=0;
        for (let srcNode of arr) {
            i++;
            this.rspc = i==L && rspc;
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
                            this.wspc = /\s$/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    // Else fixed==='', whitespace mode is not changed
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
                let i=0, toSubscribe: Array<Subscriber> = [];
                if (!area.rng) {
                    for (let [bldr] of bldrs) {
                        i++;
                        await bldr(area);
                        if (bldr.auto)  // Auto subscribe?
                            toSubscribe.push(Subscriber(area, Iter, area.prevR, i)); // Not yet the correct range, we need the next range
                    }
                    for (let subs of toSubscribe) {
                        let {sArea} = subs, r = sArea.rng, rvar = r.value as RVAR;
                        if (!rvar._Subs.size && r.next) // No subscribers yet?
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
                            if (bldr.auto && r.value?.auto)  // Auto subscribed?
                                assignEnv((r.value as RVAR).auto.env, env);
                        }
                
                builtNodeCnt += bldrs.length - start;
            },
            "ws", bldrs[0][0].ws);
    }

    private async CompElm(srcPrnt: ParentNode, srcElm: HTMLElement, bUnhide?: boolean
        ): Promise<[DOMBuilder, ChildNode, number?]> {
        let // List of source attributes, to check for unrecognized attributes
            atts =  new Atts(srcElm),
            cl = this.ctLen,
            // (this)react(s)on handlers
            reacts: Array<{attNm: string, rvars: Dependent<RVAR[]>}> = [],
            // Generic pseudo-events to be handled BEFORE building
            before: Array<{attNm: string, txt: string, hndlr?: Dependent<Handler>, C: boolean, U: boolean, D: boolean}> = [],
            // Generic pseudo-events to be handled AFTER building
            after: Array<{attNm: string, txt: string, hndlr?: Dependent<Handler>, C: boolean, U: boolean, D: boolean}> = [],
            anyH: booly,     // Truthy when there is any before or after event hanldeer

            dIf: Dependent<boolean>,        // #if condition
            raLength = this.restoreActions.length,      // To check whether any definitions have been compiled
            
            // onerror handler to be installed
            depOnerr: Dependent<Handler> & {bBldr?: boolean},
            // onsuccess handler to be installed
            depOnsucc: Dependent<Handler>,
            
            // The intermediate builder will be put here
            bldr: DOMBuilder,
            // The final builder will be put here
            elmBldr: DOMBuilder,
            
            isBl: boolean  // true when bldr won't produce output
            , m: RegExpExecArray, nm: string;
        if (bUnhide) atts.set('#hidden', 'false');        
        try {
            dIf = this.CompAttrExpr(atts, 'if');
            for (let attNm of atts.keys())
                if (m = genAtts.exec(attNm))
                    if (m[1])       // (?:this)?reacts?on)
                        reacts.push({attNm, rvars: this.compAttrExprList<RVAR>(atts, attNm, T)});
                    else {
                        let txt = atts.get(attNm);
                        if (nm = m[3])  // #?(before|after|on)(create|update|destroy)+
                            (m[2] ? before : after).push({attNm, txt, C:/c/i.test(nm), U:/u/i.test(nm), D:/y/i.test(nm) });
                        else { // #?on(?:(error)-?|success)
                            let hndlr = this.CompHandler(attNm, txt); 
                            if (m[5])   // #?onerror-?
                                ((depOnerr = hndlr) as typeof depOnerr).bBldr = !/-$/.test(attNm);
                            else depOnsucc = hndlr;
                        }
                    }
            // See if this node is a user-defined construct (component or slot) instance
            let constr = this.ctSigns.get(srcElm.localName);
            if (constr)
                bldr = await this.CompInstance(srcElm, atts, constr);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define': { // '<LET>' staat de parser niet toe.
                        let rv: string;
                        [bldr, rv] = this.CompDefine(srcElm, atts);

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
                        
                        isBl = T;
                    } break;

                    case 'if':
                    case 'case': {
                        let bHiding = atts.getB('hiding'),
                            getVal = this.CompAttrExpr<string>(atts, 'value'),
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
                                        not = !atts.getB('not');
                                        patt =
                                            (p = atts.get('match')) != N
                                                ? this.CompPattern(p)
                                            : (p = atts.get('urlmatch')) != N
                                                ? this.CompPattern(p, T)
                                            : (p = atts.get('regmatch')) != N
                                                ?  {regex: new RegExp(p, 'i'), 
                                                lvars: this.NewVars(atts.get('captures'))
                                                }
                                            : N;

                                        if (bHiding && patt?.lvars.length)
                                            throw `Pattern capturing cannot be combined with hiding`;
                                        if (patt && !getVal)
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
                                let value = getVal && getVal()
                                    , choosenAlt: typeof caseList[0] = N
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
                                        let {rng, childArea, bCr} = PrepElm(alt.node, area);
                                        if (    (!(rng.node.hidden = alt != choosenAlt)
                                                || bCr
                                                )
                                             && !area.bRootOnly)
                                            await R.CallWithHandling(alt.bldr, alt.node, childArea );
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
                        atts.get('id');
                        break;
                        
                    case 'include':
                        if (srcElm.children.length || srcElm.textContent.trim()) {
                            atts.get('src');
                            bldr = await this.CompChildNodes(srcElm);
                        }
                        else {
                            let src = atts.get('src', T)
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
                        let src = atts.get('src', T)
                            , bIncl = atts.getB('include')
                            , vars: Array<LVar & {i?:number}> = this.NewVars(atts.get('defines'))
                            , bAsync = atts.getB('async')
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
                                for (let clientSig of listImps)
                                    Object.assign(clientSig, CSigns.get(clientSig.nm)[0]);
                            })
                            for (let clientSig of listImps)
                                clientSig.prom = prom;
                        }
                        
                        bldr = async function IMPORT(reg: Area) {
                            let [bldr, CSigns] = await promModule
                                , saveEnv = env
                                , MEnv = env = NewEnv();
                            await bldr(bIncl ? reg : {parent: document.createDocumentFragment()});
                            env = saveEnv;
                            
                            defConstructs(listImps.map(S => GetC(MEnv, CSigns.get(S.nm)[1])));
                                
                            for (let lv of vars)
                                lv(MEnv[lv.i]);
                        };
                        isBl = T;

                    } break;

                    case 'react': {
                        let getRvars = this.compAttrExprList<RVAR>(atts, 'on', T)
                            , getHashes = this.compAttrExprList<unknown>(atts, 'hash')
                            , bodyBuilder = await this.CompChildNodes(srcElm);
                        
                        bldr = this.GetREACT(
                            srcElm, 'on'
                            , getRvars
                            , bodyBuilder
                            , atts.getB('renew'));

                        if (getHashes) {
                            let b = bldr;
                            bldr = async function HASH(area: Area) {
                                let {sub, rng} = PrepArea(srcElm, area, 'hash')
                                    , hashes = getHashes();

                                if (!rng.value || hashes.some((hash, i) => hash !== rng.value[i])) {
                                    rng.value = hashes;
                                    await b(sub);
                                }
                            }
                            bldr.ws = b.ws;
                        }
                    } break;

                    case 'rhtml': {
                        let getSrctext = this.CompParam<string>(atts, 'srctext', T)
                        //  , imports = this.CompAttrExpr(atts, 'imports')
                            , modifs = this.CompAttribs(atts)
                            , lThis = this;
                        this.wspc=WSpc.block;
                        
                        bldr = async function RHTML(area) {
                            let srctext = getSrctext()
                            
                                , {rng, bCr} = PrepElm(srcElm, area, 'rhtml-rhtml')
                                , {node} = rng;
                            ApplyMods(node, modifs, bCr);

                            if (area.prevR || srctext != rng.result) {
                                rng.result = srctext;
                                let 
                                    svEnv = env,
                                    C = new RCompiler(N, lThis.FilePath),
                                    sRoot = C.head = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = document.createElement('rhtml'),
                                    sArea = {parent: sRoot, rng: N, parentR: rng.child ||= new Range(N, N, 'Shadow')};

                                rng.child.erase(sRoot); sRoot.innerHTML='';
                                try {
                                    // Parsing
                                    tempElm.innerHTML = srctext;
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
                        isBl = T;
                        break;

                    case 'style':
                        this.CompStyle(srcElm);
                        isBl = T;
                        break;

                    case 'component':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBl = T;
                        break;

                    case 'document': {
                        let docVar = this.newV(atts.get('name', T)),
                            RC = new RCompiler(this),
                            bEncaps = atts.getB('encapsulate'),
                            setVars = RC.NewVars(atts.get('params')),
                            winV = RC.newV(atts.get('window')),
                            docBldr = ((RC.head = document.createElement('DocumentFragment')), await RC.CompChildNodes(srcElm));
                        bldr = async function DOCUMENT(area: Area) {
                            let {rng, bCr} = PrepArea(srcElm, area, docVar.name);
                            if (bCr) {
                                let doc = area.parent.ownerDocument,
                                    docEnv = CloneEnv(env),
                                    wins = rng.wins = new Set();
                                rng.value = {
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
                                            let area: Area = {parent: D.body, rng: (w as any).rng};
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
                            docVar(rng.value);
                        }
                        isBl = T;
                    } break;

                    case 'rhead': {
                        let childBuilder = await this.CompChildNodes(srcElm), {wspc} = this;
                        this.wspc = this.rspc = WSpc.block;
                        
                        bldr = async function HEAD(area: Area) {
                            let {sub} = PrepArea(srcElm, area);
                            sub.parent = area.parent.ownerDocument.head;
                            sub.before = N;
                            await childBuilder(sub);
                            if (sub.prevR)
                                sub.prevR.parentN = sub.parent;
                        }
                        this.wspc = wspc;
                        isBl = T;
                    } break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        bldr = await this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.ChkNoAttsLeft();
            }

            for (let g of concIter(before, after))
                anyH = g.hndlr = this.CompHandler(g.attNm, g.txt);
        }
        catch (err) { 
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
        if (!bldr) return N;
        let {ws} = bldr;
        if (depOnerr || depOnsucc) {
            let b = bldr;
            bldr = async function SetOnError(area: Area) {
                let save = {onerr, onsucc};
                try {
                    if (depOnerr) 
                        ((onerr = depOnerr()) as typeof onerr).bBldr = depOnerr.bBldr;
                    if (depOnsucc)
                        onsucc = depOnsucc();
                    await b(area);
                }
                finally { ({onerr,onsucc} = save); }
            }
        }
        if (anyH) {
            let b = bldr;
            bldr = async function ON(area: Area) {
                let r = area.rng, bfD: Handler;
                for (let g of before) {
                    if (g.D && !r)
                        bfD = g.hndlr();
                    if (r ? g.U : g.C)
                        g.hndlr().call(
                            r && r.node || area.parent
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
                            (r ? r.node : area.prevR?.node) || area.parent
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
            , 'ws',ws), srcElm];
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
                    return builder(sub);
                }
            : builder
            );

        return addP(
            async function REACT(area: Area) {
                
                let {rng, sub, bCr} = PrepArea(srcElm, area, attName);

                await builder(
                    bRenew ? PrepArea(srcElm, sub, 'renew', 2).sub : sub
                    );

                if (getRvars) {
                    let rvars = getRvars()
                        , subs: Subscriber, pVars: RVAR[]
                        , i = 0;
                    if (bCr)
                        subs = rng.subs = Subscriber(sub, updateBuilder, rng.child);
                    else {
                        ({subs, rvars: pVars} = rng);
                        if(!subs) return;   // Might happen in case of errors during Create
                        assignEnv(subs.env, env);
                    }
                    rng.rvars = rvars;
                    rng.value = sub.prevR?.value;
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
            area.parent.removeChild(rng.errNode);
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
                    area.parent.insertBefore(createErrNode(message), area.rng?.FirstOrNext);
                if (rng)
                    rng.errNode = errNode;    /*  */
            }
        }
    }

    private async CompScript(srcParent: ParentNode, srcElm: HTMLScriptElement, atts: Atts) {
        //srcParent.removeChild(srcElm);
        let {type, text, defer, async} = srcElm
            , src = atts.get('src')     // Niet srcElm.src
            , defs = atts.get('defines')
            , bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type)
            , bCls = /^((text|application)\/javascript)?$/i.test(type)
            , mOto = /^otoreact(\/((local)|static))?\b/.exec(type)
            , sLoc = mOto && mOto[2]
            , bUpd = atts.getB('updating')
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
                        globalThis[nm] = exp[i++];
                }
            ;
        
        atts.clear();

        if (this.Settings.bRunScripts && (bMod || bCls) || mOto) {
            if (mOto && mOto[3]) {
                let prom = (async () => gEval(`'use strict';([${context}])=>{${src ? await this.FetchText(src) : text}\n;return[${defs}]}`))();
                return async function LSCRIPT(area: Area) {
                    let {rng, bCr} = PrepArea(srcElm, area);
                    exp = bUpd || bCr ? rng.result = (await prom)(env) : rng.result
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
        let lvName = atts.get('let') ?? atts.get('var')
            , ixName = atts.get('index')
            , saved = this.SaveCont();
        if (ixName == '') ixName = 'index';
        try {
            if (lvName != N) { /* A regular iteration */
                let prevNm = atts.get('previous')
                    , nextNm = atts.get('next');
                if (prevNm == '') prevNm = 'previous';
                if (nextNm == '') nextNm = 'next';
                
                let getRange =
                    this.CompAttrExpr<Iterable<Item> | Promise<Iterable<Item>>>
                    (atts, 'of', T
                    // Check for being iterable
                    , iter => iter && !(Symbol.iterator in iter || Symbol.asyncIterator in iter)
                                && `Value (${iter}) is not iterable`
                    ),
                getUpdatesTo = this.CompAttrExpr<RVAR>(atts, 'updates'),
                bReact = atts.getB('reacting') || atts.getB('reactive') || !!getUpdatesTo,
            
                // Voeg de loop-variabele toe aan de context
                loopVar = this.newV(lvName),
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                ixVar = this.newV(ixName),
                prevVar = this.newV(prevNm),
                nextVar = this.newV(nextNm),

                getKey = this.CompAttrExpr<Key>(atts, 'key'),
                getHash = this.CompAttrExpr<Hash>(atts, 'hash'),

                // Compileer alle childNodes
                bodyBldr = await this.CompChildNodes(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, area: Area) {
                    let {rng, sub} = PrepArea(srcElm, area, ''),
                        {parent} = sub,
                        before = sub.before !== U ? sub.before : rng.Next,
                        iterable = getRange() || E
                    
                        , pIter = async (iter: Iterable<Item>) => {
                        let svEnv = SaveEnv();
                        try {
                            // Map of previous data, if any
                            let keyMap: Map<Key, Range> = rng.value ||= new Map(),
                            // Map of the newly obtained data
                                newMap: Map<Key, {item:Item, hash:Hash, idx: number}> = new Map();
                            loopVar(); ixVar();

                            let idx=0;
                            for await (let item of iter) {
                                loopVar(item,T);
                                ixVar(idx,T);
                                let hash = getHash && getHash()
                                    , key = getKey?.() ?? hash;
                                if (key != N && newMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                newMap.set(key ?? {}, {item, hash, idx: idx++});
                            }

                            let nxChld = rng.child,
                                iterator = newMap.entries(),
                                nextIter = nextNm ? newMap.values() : N

                                , prevItem: Item, nextItem: Item
                                , prevRange: Range = N,
                                childArea: Area;
                            sub.parentR = rng;
                            prevVar(); nextVar();

                            if (nextIter) nextIter.next();

                            while(T) {
                                let k: Key, nx = iterator.next();
                                while (nxChld && !newMap.has(k = nxChld.key)) {
                                    if (k != N)
                                        keyMap.delete(k);
                                    nxChld.erase(parent);
                                    if (nxChld.subs)
                                        nxChld.rvars[0]._Subs.delete(nxChld.subs);
                                    nxChld.prev = N;
                                    nxChld = nxChld.next;
                                }

                                if (nx.done) break;
                                let [key, {item, hash, idx}] = nx.value
                                    , childRange = keyMap.get(key)
                                    , bCr = !childRange;

                                if (nextIter)
                                    nextItem = nextIter.next().value?.item;

                                if (bCr) {
                                    // Item has to be newly created
                                    sub.rng = N;
                                    sub.prevR = prevRange;
                                    sub.before = nxChld?.FirstOrNext || before;
                                    ({rng: childRange, sub: childArea} = PrepArea(N, sub, `${lvName}(${idx})`));
                                    if (key != N) {
                                        if (keyMap.has(key))
                                            throw `Duplicate key '${key}'`;
                                        keyMap.set(key, childRange);
                                    }
                                    childRange.key = key;
                                }
                                else {
                                    // Item already occurs in the series
                                    
                                    if (childRange.fragm) {
                                        parent.insertBefore(childRange.fragm, nxChld?.FirstOrNext || before);
                                        childRange.fragm = N;
                                    }
                                    else
                                        while (T) {
                                            if (nxChld == childRange)
                                                nxChld = nxChld.next;
                                            else {
                                                // Item has to be moved
                                                if (newMap.get(nxChld.key)?.idx > idx + 2) {
                                                    let fragm = nxChld.fragm = document.createDocumentFragment();
                                                    for (let node of nxChld.Nodes())
                                                        fragm.appendChild(node);
                                                    
                                                    nxChld = nxChld.next;
                                                    continue;
                                                }

                                                childRange.prev.next = childRange.next;
                                                if (childRange.next)
                                                    childRange.next.prev = childRange.prev;
                                                let nextNode = nxChld?.FirstOrNext || before;
                                                for (let node of childRange.Nodes())
                                                    parent.insertBefore(node, nextNode);
                                            }
                                            break;
                                        }

                                    childRange.next = nxChld;
                                    childRange.text = `${lvName}(${idx})`;

                                    if (prevRange) 
                                        prevRange.next = childRange;
                                    else
                                        rng.child = childRange;
                                    sub.rng = childRange;
                                    childArea = PrepArea(N, sub, '').sub;
                                    sub.parentR = N;
                                }
                                childRange.prev = prevRange;
                                prevRange = childRange;

                                if (hash == N
                                    ||  hash != childRange.hash as Hash
                                        && (childRange.hash = hash, T)
                                ) {
                                    // Environment instellen
                                    if (bReact && (bCr || item != childRange.rvars[0]))
                                    {
                                        RVAR_Light<Item>(item, getUpdatesTo && [getUpdatesTo()]);
                                        if (childRange.subs)
                                            item._Subs = childRange.rvars[0]._Subs 
                                    }
                                    
                                    loopVar(item,T);
                                    ixVar(idx,T);
                                    prevVar(prevItem,T);
                                    nextVar(nextItem,T);

                                    // Body berekenen
                                    await bodyBldr(childArea);

                                    if (bReact)
                                        if (childRange.subs)
                                            assignEnv(childRange.subs.env, env);
                                        else {
                                            (item as RVAR_Light<Item>).Subscribe(
                                                childRange.subs = Subscriber(childArea, bodyBldr, childRange.child)
                                            );
                                            childRange.rvars = [item as RVAR];
                                        }
                                }

                                prevItem = item;
                            }
                            if (prevRange) prevRange.next = N; else rng.child = N;
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
                let nm = atts.get('of', T, T).toLowerCase(),
                    CS = this.ctSigns.get(nm);

                if (!CS)
                    // Slot doesn't exist; it's probably a missing 'let'
                    throw `Missing attribute [let]`;

                let ck: CKey = CS[1],
                    ixVar = this.newV(ixName),
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

    private CompDefine(srcElm: HTMLElement, atts: Atts): [DOMBuilder, string] {
        if (srcElm.childElementCount)
            throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
        let rv  = atts.get('rvar'),
            varNm     = rv || atts.get('let') || atts.get('var', T),
            getVal    = this.CompParam(atts, 'value') || dU,
            getStore    = rv && this.CompAttrExpr<Store>(atts, 'store'),
            bReact      = atts.getB('reacting') || atts.getB('updating'),
            lv          = this.newV(varNm);
        
        return [async function DEF(this: RCompiler, area) {
                let {rng, bCr} = PrepArea(srcElm, area);
                if (bCr || bReact){
                    let v = getVal();
                    if (rv)
                        if (bCr)
                            rng.value = new _RVAR(N, v, getStore && getStore(), `RVAR_${rv}`);
                        else
                            rng.value._Set(v);
                    else
                        rng.value = v;
                }
                lv(rng.value);
            }, rv];

    }

    private ParseSignat(elmSignat: Element, bIsSlot?: boolean):  Signature {
        let signat = new Signature(elmSignat, bIsSlot), s: Signature;
        for (let attr of elmSignat.attributes) {
            if (signat.RestParam) 
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
                    signat.RestParam = param;
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
            bRecurs = atts.getB('recursive'),
            {wspc} = this
            , signats: Array<Signature> = []
            , templates: Array<ConstructDef> = []
            , {head}=this
            , encStyles = atts.getB('encapsulate') && (this.head = srcElm.ownerDocument.createDocumentFragment()).children
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
                        ({mode,nm}) => [nm, this.newV((myAtts.get(mode + nm) ?? myAtts.get(nm, bIsSlot)) || nm)]
                    ),
                DC = this.NewConstructs(signat.Slots.values());

            if (!atts)
                myAtts.ChkNoAttsLeft();
            this.wspc = this.rspc = WSpc.block;
            let
                builder = await this.CompChildNodes(contentNode),
                {nm: Cnm} = signat,
                customName = /^[A-Z].*-/.test(Cnm) ? Cnm : `rhtml-${Cnm}`;

            return async function TEMPLATE(area: Area, args: unknown[], mSlotTemplates, slotEnv
                ) {
                let saved = SaveEnv(), i = 0;
                try {
                    for (let [nm,lv] of lvars){
                        let arg = args[nm], dflt: Dependent<unknown>;
                        if (arg===U && (dflt = signat.Params[i]?.pDflt))
                            arg = dflt();
                        lv(arg);
                        i++;
                    }
                    DC(mapIter(mSlotTemplates, 
                        ([nm, templates]) => ({nm, templates, CEnv: slotEnv, Cnm})
                    ));

                    if (encStyles) {
                        let {rng: elmRange, childArea, bCr} = PrepElm(srcElm, area, customName), 
                            elm = elmRange.node,
                            shadow = elm.shadowRoot || elm.attachShadow({mode: 'open'});
                        if (bCr)
                            for (let style of encStyles)
                                shadow.appendChild(style.cloneNode(T));
                        
                        if (signat.RestParam)
                            ApplyMod(elm, {mt: MType.RestArgument, nm: N, depV: null}, args[signat.RestParam.nm], bCr);
                        childArea.parent = shadow;
                        area = childArea;
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
        let {nm, RestParam, CSlot} = signat,
            getArgs: Array<[string,Dependent<unknown>,Dependent<Handler>?]> = [],
            SBldrs = new Map<string, Template[]>();

        for (let [nm] of signat.Slots)
            SBldrs.set(nm, []);

        for (let {mode, nm, pDflt} of signat.Params)
            if (mode=='@') {
                let attVal = atts.get(mode+nm, !pDflt);
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

        if (RestParam) {
            let modifs = this.CompAttribs(atts);
            getArgs.push([
                RestParam.nm, 
                () => modifs.map(M => ({M, value: M.depV()})) as RestParameter
            ]);
        }
        
        atts.ChkNoAttsLeft();
        this.wspc = WSpc.inline;

        return async function INSTANCE(this: RCompiler, area: Area) {
            let IEnv = env,
                {rng, sub, bCr} = PrepArea(srcElm, area),
                cdef = GetC(env, ck),
                args = rng.result ||= {};
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

    private async CompHTMLElement(srcElm: HTMLElement, atts: Atts) {
        // Remove trailing dots
        let nm = srcElm.localName.replace(/\.+$/, ''),
            // Remember preceeding whitespace-mode
            preWs = this.wspc
            // Whitespace-mode after this element
            , postWs: WSpc;

        if (this.mPreformatted.has(nm)) {
            this.wspc = WSpc.preserve; postWs = WSpc.block;
        }
        else if (regBlock.test(nm))
            this.wspc = this.rspc = postWs = WSpc.block;
        
        else if (regInline.test(nm)) {  // Inline-block
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
        let bldr: DOMBuilder = async function ELEMENT(this: RCompiler, area: Area) {
            let {rng: {node}, childArea, bCr} = PrepElm(srcElm, area, nm);
            
            if (!area.bRootOnly)
                // Build children
                await childnodesBldr(childArea);

            node.removeAttribute('class');
            for (let {evType, listener} of node.handlers || E)
                node.removeEventListener(evType, listener);
            node.handlers = [];
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
            if (mt == MType.Prop && nm=='valueasnumber')
                nm = 'value';
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
                            let dS = this.CompJScript<(a:any) => void>(`$=>{if(${V}!==$)${V}=$}`), cnm: string;
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

    private CompParam<T = unknown>(atts: Atts, attName: string, bReq?: boolean): Dependent<T> {
        let v = atts.get(attName);
        return (
            v == N ? this.CompAttrExpr<T>(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandler(attName, v) as Dependent<any>
            : this.CompString(v, attName) as Dependent<any>
        );
    }
    private CompAttrExpr<T>(atts: Atts, attName: string, bReq?: boolean
        , check?: (t:T) => string   // Additional check
        ) {
        return this.CompJScript<T>(atts.get(attName, bReq, T),attName, U, check);
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
            , errorInfo = `${descrip?`[${descrip}] `:''}${delims[0]}${Abbrev(expr,60)}${delims[1]}: `;

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
                        catch (err) { throw errorInfo + err; }
                    }
                : bThis
                    ? function (this: HTMLElement) {
                            try { return rout.call(this, env); } 
                            catch (err) { throw errorInfo + err; }
                        }
                : () => {
                        try { return rout(env); } 
                        catch (err) { throw errorInfo + err; }
                    }
                , "bThis", bThis);
        }
        catch (err) { throw errorInfo + err }             // Compiletime error
    }
    private CompName(nm: string): Dependent<unknown> {
        let i = this.ctMap.get(nm);
        if (i==N) throw `Unknown name '${nm}'`;
        return () => env[i];
    }
    private compAttrExprList<T>(atts: Atts, attName: string, bReacts?: boolean): Dependent<T[]> {
        let list = atts.get(attName, F, T);
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
        let m = document.getElementById(src);
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
    let r = await gFetch(input, init);
    if (!r.ok)
        throw `${init?.method || 'GET'} ${input} returned ${r.status} ${r.statusText}`;
    return r;
}

function quoteReg(fixed: string) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}

class Atts extends Map<string,string> {
    constructor(elm: HTMLElement) {
        super();
        for (let att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }

    public get(nm: string, bRequired?: boolean, bHashAllowed?: boolean) {
        let m = nm, v = super.get(m);
        if (v==N && bHashAllowed)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bRequired)
            throw `Missing attribute [${nm}]`;
        return v;
    }
    public getB(nm: string): boolean { 
        let v = this.get(nm),
            m = /^((false)|true)?$/i.exec(v);
        if (v!=N) {
            if (!m) throw `@${nm}: invalid value`;
            return !m[2];
        }
    }

    public ChkNoAttsLeft() {  
        if (super.size)
            throw `Unknown attribute${super.size > 1 ? 's' : ''}: ${Array.from(super.keys()).join(',')}`;
    }
}

let // Property namesto be replaced
    altProps = {"class": "className", for: "htmlFor"}
    // Generic attributes
    , genAtts = /^#?(?:((?:this)?reacts?on)|(?:(before)|on|after)((?:create|update|destroy)+)|on((error)-?|success))$/
    // Valid identifiers
    , regIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/
    // Reserved words
    , regReserv = /^(break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/

// Capitalization of (just) style property names.
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
// Better not use lookbehind assertions (https://caniuse.com/js-regexp-lookbehind):
    , words = 'accent|additive|align|angle|animation|ascent|aspect|auto|back(drop|face|ground)|backface|behavior|blend|block|border|bottom|box|break|caption|caret|character|clip|color|column(s$)?|combine|conic|content|counter|css|decoration|display|emphasis|empty|end|feature|fill|filter|flex|font|forced|frequency|gap|grid|hanging|hue|hyphenate|image|initial|inline|inset|iteration|justify|language|left|letter|line(ar)?|list|margin|mask|masonry|math|max|min|nav|object|optical|outline|overflow|padding|page|paint|perspective|place|play|pointer|rotate|position|print|radial|read|repeating|right|row(s$)?|ruby|rule|scale|scroll(bar)?|shape|size|snap|skew|skip|speak|start|style|tab(le)?|template|text|timing|top|touch|transform|transition|translate|underline|unicode|user|variant|variation|vertical|viewport|white|will|word|writing|^z'
    , regCapit = new RegExp(`(${words})|.`, "g")

    // Elements that trigger block mode; whitespace before/after is irrelevant
    , regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/
    // Elements that trigger inline mode
    , regInline = /^(button|input|img)$/;

function CheckId(nm: string) {
    // Check valid JavaScript identifier
    if (!regIdent.test(nm)) throw `Invalid identifier '${nm}'`;
    if (regReserv.test(nm)) throw `Reserved keyword '${nm}'`;
    return nm;
}
// Properly capitalize a Style property
function CapitalProp(nm: string) {
    let b: boolean;
    return nm.replace(regCapit, (w, w1) => {
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
    return Abbrev(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLen-1) + '>';
}
function Abbrev(s: string, maxLen: number) {
    return (maxLen && s.length > maxLen
        ? s.slice(0, maxLen - 3) + "..."
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
    let e = document.createElement('div'), s = e.style;        
    s.color = 'crimson'; s.fontFamily = 'sans-serif'; s.fontSize = '10pt';
    e.innerText = msg;
    return e;
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

Object.assign(
    globalThis, {RVAR, range, reroute, RFetch}
)

Object.assign(docLocation, {
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
        setTimeout((() => document.getElementById(location.hash.slice(1))?.scrollIntoView()), 6);
}

setTimeout(() =>
    /^rhtml$/i.test(document.body.getAttribute('type'))
        && RCompile()
, 0);