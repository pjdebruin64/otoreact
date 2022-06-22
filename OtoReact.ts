// Global settings 
let defaultSettings = {
    bTiming:        false,
    bAbortOnError:  false,  // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    true,   // Show runtime errors as text in the DOM output
    bRunScripts:    false,
    basePattern:    '/',
    preformatted:   [],
    bNoGlobals:     false,
    bDollarRequired: false,
    bSetPointer:    true,
    bKeepWhiteSpace: false,
    bKeepComments:  false,
}
, parser = new DOMParser()
, gEval = eval, gFetch=fetch
, u = undefined, n = null, w = window;
type bool = boolean|string|number|object;
w.globalThis || ((w as any).globalThis = w);

// A DOMBUILDER is the semantics of a piece of RHTML.
// It can both build (construct) a new piece of DOM, and update an existing piece of DOM.
type DOMBuilder = ((reg: Area) => Promise<void>) & {ws?: bool; auto?: bool};
const enum WSpc {block = 1, inlineSpc, inline, preserve}

// An AREA is the (runtime) place to build or update, with all required information
type Area = {
    rng?: Range,              // Existing piece of DOM
    parent: Node;               // DOM parent node
    before?: ChildNode;

    /* When !rng: */
    source?: ChildNode;         // Optional source node to be replaced by the range 
    parentR?: Range;            // The new range shall either be the first child of some range,
    prevR?: Range;              // Or the next sibling of some other range

    /* When rng: */
    bRootOnly?: bool,        // true == just update the root node, not its children
}

// A RANGE is a piece of constructed DOM, in relation to the source RHTML.
// It can either be a single DOM node or a linked list of subranges,
class Range<NodeType extends ChildNode = ChildNode> {
    
    child: Range;           // Linked list of children (null=empty)
    next: Range = null;     // Next item in linked list
    parentR?: Range;
    newParent?: Node;

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
    onDest?: Handler;

    // Only for FOR-iteraties
    hash?: Hash; key?: Key; prev?: Range;
    fragm?: DocumentFragment;
    rvar?: RVAR_Light<Item>;
    iSub?: Subscriber<Item>;

    // For reactive elements
    updated?: number;
    subs?: Subscriber;
    rvars?: RVAR[];

    // For DOCUMENT nodes
    wins?: Window[];

    public get First(): ChildNode {
        let f: ChildNode
        if (f = this.node) return f;
        let child = this.child;
        while (child) {
            if (f = child.First) return f;
            child = child.next;
        }
    }
    
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
        let {node, child} = this;
        if (node && parent) {
            parent.removeChild(node);
            parent = null;
        }
        this.child = null;
        while (child) {
            child.erase(child.newParent || parent);
            child.parentR = null;                
            if (child.rvars)
                for (let rvar of child.rvars)
                    rvar._Subscribers.delete(child.subs);
            if (child.onDest)
                child.onDest.call(child.node);
            child = child.next;
        }
    }
}

// A CONTEXT is the set of local variable names, each with a number indicating its position in an environment
type Context = Map<string, number>;

// An ENVIRONMENT for a given context is the array of concrete values for all names in that context,
// together with concrete definitions for all visible constructs
type Environment = 
    Array<unknown> 
    & { constructs: Map<string, ConstructDef>,
    };

// A  DEPENDENT value of type T in a given context is a routine computing a T using an environment for that context.
// It may carry an indicator that the routine might need a value for 'this'.
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dependent<T> = (() => T) & {bThis?: bool};
let dU: Dependent<any> = () => u;

function PrepArea(srcElm: HTMLElement, area: Area, text: string = '',
    nWipe?: 1|2,  // 1=wipe when result has changed; 2=wipe always
    result?: any,
) : {rng: Range, sub:Area, bInit: bool}
{
    let {parent, rng} = area,
        sub: Area = {parent, rng: null }
        , bInit = !rng as bool;
    if (bInit) {
        sub.source = area.source;
        sub.before = area.before;
        if (srcElm) text = srcElm.localName + (text && ' ') + text;
        
        UpdPrevRange(area, rng = sub.parentR = new Range(null, area, text));
        rng.result = result;
    }
    else {
        sub.rng = rng.child;
        area.rng = rng.next;

        if (nWipe && (nWipe==2 || result != rng.result)) {
            rng.result = result;
            rng.erase(parent); 
            sub.rng = null;
            sub.before = rng.Next;
            sub.parentR = rng;
            bInit = 1;
        }
    }
    
    return {rng, sub, bInit};
}
function UpdPrevRange(area: Area, rng: Range) {
    let r: Range
    if (r = area.prevR) 
        r.next = rng;
    else if (r = area.parentR)
        r.child = rng;

    area.prevR = rng;
}

function PrepElm<T={}>(srcElm: HTMLElement, area: Area, nodeName = srcElm.nodeName): 
    {rng: Range<HTMLElement> & T, childArea: Area, bInit: boolean} {
    let rng = area.rng as Range<HTMLElement> & T, bInit = !rng;
    if (bInit) {
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
            before: null,
            parentR: rng
        },
        bInit
    };
}

function PrepCharData(area: Area, content: string, bComm?: bool) {
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

export async function RCompile(elm: HTMLElement, settings?: Settings): Promise<void> { 
    try {
        let {basePattern} = R.Settings = {...defaultSettings, ...settings},
            m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (
            docLocation.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : ''
        )
        R.RootElm = elm;
        await R.Compile(elm);

        // Initial build
        R.start = performance.now();
        builtNodeCnt = 0;
        let area: Area = {parent: elm.parentElement, source: elm, rng: n};
        await R.Build(area);
        w.addEventListener('pagehide', ()=>childWins.forEach(w=>w.close()));
        //w.addEventListener('pagehide', ()=>{for(let w of childWins)w.close()});
        R.logTime(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        alert(`OtoReact error: `+err);
    }
}

type SavedContext = number;
function NewEnv(): Environment { 
    let e = [] as Environment;
    e.constructs = new Map();
    return e;
}
function CloneEnv(env: Environment): Environment {
    let e = Object.assign(new Array(), env);
    e.constructs = new Map(env.constructs.entries());
    return e;
}
function assignEnv(target: Environment, source: Environment) {
    let C = target.constructs;
    Object.assign(target, source)
        .constructs = C;
}

type Subscriber<T = unknown> = ((t?: T) => (void|Promise<void>)) &
    {   ref?: {};
        sArea?: Area;
        bImm?: bool;
        env?: Environment;
    };

type ParentNode = HTMLElement|DocumentFragment;


type Handler = (ev:Event) => any;
type LVar = ((value?: unknown) => void) & {nm: string, I: number};

// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {mode: string, nm: string, pDflt: Dependent<unknown>};
// A SIGNATURE describes an RHTML user construct: a component or a slot
class Signature {
    constructor(public srcElm: Element){ 
        this.nm = srcElm.localName;
    }
    public nm: string;
    public prom: Promise<any>;
    public Params: Array<Parameter> = [];
    public RestParam: Parameter = n;
    public Slots = new Map<string, Signature>();

    // Check whether an import signature is compatible with the real module signature
    IsCompatible(sig: Signature): bool {
        if (!sig) return ;
        let r = 1 as bool,
            mapSigParams = new Map(sig.Params.map(p => [p.nm, p.pDflt]));
        // All parameters in the import must be present in the module
        for (let {nm, pDflt} of this.Params)
            if (mapSigParams.has(nm)) {
                // When optional in the import, then also optional in the module
                r &&= (!pDflt || mapSigParams.get(nm));
                mapSigParams.delete(nm);
            }
            else r = 0
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
type ConstructDef = {nm: string, templates: Template[], CEnv?: Environment};
type Template = 
    (this: RCompiler, area: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment)
    => Promise<void>;

export type RVAR_Light<T> = T & {
    _Subscribers: Set<Subscriber>;
    _UpdatesTo?: Array<RVAR>;
    Subscribe?: (sub:Subscriber) => void;
    store?: any;
    Save?: () => void;
    readonly U?: T;
};

interface Item {}  // Three unknown but distinct types, used by the <FOR> construct
interface Key {}
interface Hash {}

const enum MType {Attr, Prop, Src, Class, Style, Event, AddToStyle, AddToClassList, RestArgument,
    oncreate, onupdate
}
type Modifier = {
    mt: MType,
    nm: string,
    depV: Dependent<unknown>,
}
type RestParameter = Array<{mt: MType, nm: string, value: unknown}>;
let bReadOnly: boolean|0|1 = 0;

function ApplyMod(elm: HTMLElement, mt: MType, nm: string, val: unknown, bCreate: boolean) {    
    switch (mt) {
        case MType.Attr:
            elm.setAttribute(nm, val as string); 
            break;
        case MType.Src:
            elm.setAttribute('src',  new URL(val as string, nm).href);
            break;
        case MType.Prop:
            if (val===u && typeof elm[nm]=='string') val = '';
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
                for (let [nm,v] of Object.entries(val as Object))
                    elm.style[nm] = v || (v === 0 ? '0' : null);
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
            for (let {mt, nm, value} of val as RestParameter || [])
                ApplyMod(elm, mt, nm, value, bCreate);
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
function ApplyMods(elm: HTMLElement, modifs: Modifier[], bCreate?: boolean) {
    // Apply all modifiers: adding attributes, classes, styles, events
    bReadOnly= 1;
    for (let {mt, nm, depV} of modifs)
        try {
            let value = depV.bThis ? depV.call(elm) : depV();    // Evaluate the dependent value in the current environment
            // See what to do with it
            ApplyMod(elm, mt, nm, value, bCreate)
        }
        catch (err) { throw `[${nm}]: ${err}` }
    
    bReadOnly = 0;
}

let RModules = new Map<string, Promise<[DOMBuilder,Map<string, Signature>]>>(),
   
/* Runtime data */
    env: Environment,
    onerr: Handler & {bBldr?: boolean},
    onsucc: Handler,
    builtNodeCnt = 0,
    envActions: Array<() => void> = []
type EnvState = number;
function SaveEnv(): EnvState {
    return envActions.length;
}
function RestoreEnv(savedEnv: EnvState) {
    for (let j=envActions.length; j>savedEnv; j--)
        envActions.pop()();
}
function DefConstr(C: ConstructDef) {
    let {constructs} = env, prevDef = constructs.get(C.nm);
    mapNm(constructs, C);
    envActions.push(() => mapSet(constructs,C.nm, prevDef));
}

let updCnt = 0;

class RCompiler {

    static iNum=0;
    public num = RCompiler.iNum++;

    private RC: RCompiler;
    private ContextMap: Context;
    private context: string;
    private CSignatures: Map<string, Signature>;

    private cRvars = new Map<string,bool>();

    private head: Node;
    private StyleBefore: ChildNode;
    public FilePath: string;
    public RootElm: ParentNode;
 
    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(
        RC?: RCompiler,
        bClr?: bool
    ) { 
        this.Settings   = RC ? {...RC.Settings} : {...defaultSettings};
        this.RC = RC ||= this;
        this.FilePath   = RC.FilePath;
        this.head  = RC.head || document.head;
        if (bClr) RC=this;
        this.context    = RC?.context || "";
        this.ContextMap = RC ? new Map(RC.ContextMap) : new Map();
        this.CSignatures = RC ? new Map(RC.CSignatures) : new Map();
        this.StyleBefore = RC.StyleBefore
    }
    //private get MainC():RCompiler { return this.clone || this; }

    private restoreActions: Array<() => void> = [];

    private SaveCont(): SavedContext {
        return this.restoreActions.length;
    }
    private RestoreCont(sv: SavedContext) {
        for (let j=this.restoreActions.length; j>sv; j--)
            this.restoreActions.pop()();
    }

    private NewV(nm: string): LVar {
        let lv: LVar;
        if (!(nm = nm?.trim()))
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
           lv = ((_: unknown) => {}) as LVar;
        else {
            nm = CheckIdentifier(nm);

            let i = this.ContextMap.get(nm);
            if (i == n){
                let prevCont = this.context;
                i = this.ContextMap.size;
                this.ContextMap.set(nm, i);
                this.context += `${nm},`
                this.restoreActions.push(
                    () => { this.ContextMap.delete( nm );
                        this.context = prevCont;
                    }
                );
                lv = ((v: unknown) => {
                    envActions.push( () => { env.length = i; });
                    env[i] = v;
                }) as LVar;
            }
            else
                lv = ((v: unknown) => {
                    let prev = env[i];
                    envActions.push( () => {env[i] = prev } );                    
                    env[i] = v;
                }) as LVar;
            lv.I = i;
        }
        lv.nm = nm;
        return lv;        
    }
    private SetVar(lv: LVar, v: unknown) {
        if (lv.I>=0) env[lv.I] = v;
    }
    private NewVars(varlist: string): Array<LVar> {
        return (varlist
            ? varlist.split(',').map(nm => this.NewV(nm))
            : []
            );
    }

    private AddConstructs(listS: Iterable<Signature>) {
        for (let S of listS) {
            let savedC = this.CSignatures.get(S.nm);
            mapNm(this.CSignatures, S);
            this.restoreActions.push(() => 
                mapSet(this.CSignatures, S.nm, savedC)
            );
        }
    }

    // Compile a source tree into an ElmBuilder
    public async Compile(
        elm: ParentNode, 
        settings: Settings = {},
        childnodes?: Iterable<ChildNode>,  // Compile the element itself, or just its childnodes
    ) {
        let t0 = performance.now(), savedR = R;
        Object.assign(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.mPreformatted.add(tag.toLowerCase());
        try {
            R = this;
            this.Builder = childnodes
                ? await this.CompChildNodes(elm, childnodes)
                : (await this.CompElm(elm.parentElement, elm as HTMLElement, 1))[0]
            this.bCompiled = 1;
        }
        finally {
            R = savedR;
        }
        this.logTime(`Compiled ${this.sourceNodeCount} nodes in ${(performance.now() - t0).toFixed(1)} ms`);
    }

    logTime(msg: string) {
        if (this.Settings.bTiming)
            console.log(msg);
    }

    private mPreformatted = new Set<string>(['pre']);
        
    Subscriber({parent, bRootOnly}: Area, builder: DOMBuilder, rng: Range, ...args ): Subscriber {
        if (rng)
            rng.updated = updCnt;
        let sArea: Area = {
                parent, bRootOnly,
                rng,
            },
            subEnv = {env: CloneEnv(env), onerr, onsucc},
            subs: Subscriber = async () => {
                let {rng} = sArea, save = {env, onerr, onsucc};
                if ((rng.updated || 0) < updCnt)
                {

                    ({env, onerr, onsucc} = subEnv);
                    rng.updated = updCnt;
                    builtNodeCnt++;
                    try {
                        await builder.call(this, {...sArea}, ...args);
                    }
                    finally {({env, onerr, onsucc} = save)}
                }
            };
        subs.sArea = sArea;
        subs.ref = rng;
        subs.env = subEnv.env;

        return subs;
    }

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
    private bCompiled: bool;

    private wspc = WSpc.block;
    private rspc: number|boolean = 1;
    
    public DirtyVars = new Set<{_Subscribers: Set<Subscriber>; store?: any; Save?: () => void}>();

    // Bijwerken van alle elementen die afhangen van reactieve variabelen
    private bUpdating: bool;
    private hUpdate: number = n;
    RUpdate() {
        if (!this.bUpdating && !this.hUpdate)
            this.hUpdate = setTimeout(() => {
                this.hUpdate = n;
                this.DoUpdate();
            }, 5);
    }

    public start: number;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
    
        this.bUpdating = 1;
        let saveR = R; R = this;
        try {
            builtNodeCnt = 0;
            this.start =performance.now();
            while (this.DirtyVars.size) {
                updCnt++;
                let dv = this.DirtyVars;
                this.DirtyVars = new Set();
                for (let rv of dv) {
                    if (rv.store)
                        rv.Save();
                    for (let subs of rv._Subscribers)
                        if (!subs.bImm)
                            try { await subs(); }
                            catch (err) {
                                let msg = `ERROR: `+err;
                                console.log(msg);
                                alert(msg);
                            }
                }
            }
            this.logTime(`${R.num}: Updated ${builtNodeCnt} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
        }
        finally { 
            R = saveR;this.bUpdating = 0;
        }
    }

    /* A "responsive variable" is a variable that listeners can subscribe to. */
    RVAR<T>(
        nm?: string, 
        value?: T | Promise<T>, 
        store?: Store,
        subs?: (t:T) => void,
        storeName?: string
    ) {
        let r = new _RVAR<T>(this.RC, nm, value, store, storeName);
        if (subs)
            r.Subscribe(subs, 1, 0);
        return r;
    } // as <T>(nm?: string, initialValue?: T, store?: Store) => RVAR<T>;
    
    private RVAR_Light<T>(
        t: RVAR_Light<T>, 
        updatesTo?: Array<RVAR>,
    ): RVAR_Light<T> {
        if (!t._Subscribers) {
            t._Subscribers = new Set();
            t._UpdatesTo = updatesTo;
            let {RC} = this as RCompiler;
            Object.defineProperty(t, 'U',
                {get:
                    () => {
                        if (!bReadOnly) {
                            RC.DirtyVars.add(t);
                            if (t._UpdatesTo?.length)
                                for (let rvar of t._UpdatesTo)
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

    private async CompChildNodes(
        srcParent: ParentNode,
        childNodes: Iterable<ChildNode> = srcParent.childNodes,
    ): Promise<DOMBuilder> {
        let saved = this.SaveCont();
        try {
            let bldr = await this.CompIter(srcParent, childNodes);
            return bldr ?
                 async function ChildNodes(this: RCompiler, area) {
                    let savEnv = SaveEnv();
                    try { await bldr.call(this, area); }
                    finally { RestoreEnv(savEnv); }
                }
                : async ()=>{};
        }
        finally { this.RestoreCont(saved); }
    }

    //private CreatedRvars: RVAR[] = [];

    private async CompIter(srcParent: ParentNode, iter: Iterable<ChildNode>): Promise<DOMBuilder> {
        let builders = [] as Array< [DOMBuilder, ChildNode, (boolean|number)?] >
            , {rspc} = this
            , arr = Array.from(iter), L = arr.length
            , i=0;
        for (let srcNode of arr) {
            i++;
            this.rspc = i==L && rspc;
            let bldr: [DOMBuilder, ChildNode, (boolean|number)?];
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    this.sourceNodeCount ++;
                    bldr = await this.CompElm(srcParent, srcNode as HTMLElement);
                    break;

                case Node.TEXT_NODE:
                    this.sourceNodeCount ++;
                    let str = srcNode.nodeValue;
                    
                    let getText = this.CompString( str ), {fixed} = getText;
                    if (fixed !== '') { // Either nonempty or undefined
                        bldr = 
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
                        let getText = this.CompString(srcNode.nodeValue, 'Comment');
                        bldr =
                            [ async (area:Area)=> PrepCharData(area, getText(), 1), srcNode, 1]
                    }
                    break;
            }
                       
            if (bldr ? bldr[0].ws : this.rspc)
                prune();
            if (bldr) 
                builders.push(bldr);
        }
        function prune() {
            let i = builders.length, isB: boolean|number;
            while (i-- && (isB= builders[i][2]))
                if (isB === true)
                    builders.splice(i, 1);
        }
        if (rspc)
            prune();

        if (!builders.length) return n;
        let Iter: DOMBuilder = 
            async function Iter(this: RCompiler, area: Area, start: number = 0)
                // start > 0 is use
            {                
                let i=0, toSubscribe: Array<Subscriber> = [];
                if (!area.rng) {
                    for (let [bldr] of builders) {
                        i++;
                        await bldr.call(this, area);
                        if (bldr.auto)  // Auto subscribe?
                            toSubscribe.push(this.Subscriber(area, Iter, area.prevR, i)); // Not yet the correct range, we need the next range
                    }
                    for (let subs of toSubscribe) {
                        let {sArea} = subs, r = sArea.rng, rvar = r.value as RVAR;
                        if (!rvar._Subscribers.size && r.next) // No subscribers yet?
                        {   // Then subscribe with the correct range
                            (sArea.rng = r.next).updated = 0;
                            subs.ref = {};
                            rvar.Subscribe(rvar.auto = subs);
                        }
                    }
                } else
                    for (let [bldr] of builders)
                        if (i++ >= start) {
                            let r = area.rng;
                            await bldr.call(this, area);
                            if (bldr.auto && r.value.auto)  // Auto subscribe?
                                assignEnv((r.value as RVAR).auto.env, env);
                        }
                
                builtNodeCnt += builders.length - start;
            };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }

    static genAtts = /^#?(?:((?:this)?reacts?on)|on((?:create|update|destroy)+)|on((error)-?|success))$/;
    private async CompElm(srcPrnt: ParentNode, srcElm: HTMLElement, bUnhide?: bool
        ): Promise<[DOMBuilder, ChildNode, number?]> {
        let atts =  new Atts(srcElm),
            reacts: Array<{attNm: string, rvars: Dependent<RVAR[]>}> = [],
            genMods: Array<{attNm: string, txt: string, hndlr?: Dependent<Handler>, C: boolean, U: boolean, D: boolean}> = [],
            dIf: Dependent<boolean>, raLength = this.restoreActions.length,
            dOnDest:Dependent<Handler>,
            
            depOnerr: Dependent<Handler> & {bBldr?: boolean}
            , depOnsucc: Dependent<Handler>
            , bldr: DOMBuilder, elmBldr: DOMBuilder
            , isBl: number  // Is the currently generated DOM blank
            , m: RegExpExecArray;
        if (bUnhide) atts.set('#hidden', 'false');        
        try {
            dIf = this.CompAttrExpr(atts, 'if');
            for (let attNm of atts.keys())
                if (m = RCompiler.genAtts.exec(attNm))
                    if (m[1])       // (?:this)?reacts?on)
                        reacts.push({attNm, rvars: this.compAttrExprList<RVAR>(atts, attNm, 1)});
                    else {
                        let txt = atts.get(attNm);
                        if (m[2])  // #?on(create|update)+
                            genMods.push({attNm, txt, C:/c/i.test(m[2]), U:/u/i.test(m[2]), D:/y/i.test(m[2]) });
                        else { // #?on(?:(error)-?|success)
                            let hndlr = this.CompHandler(attNm, txt); 
                            if (m[4])   // #?onerror-?
                                ((depOnerr = hndlr) as typeof depOnerr).bBldr = !/-$/.test(attNm);
                            else depOnsucc = hndlr;
                        }
                    }
            // See if this node is a user-defined construct (component or slot) instance
            let constr = this.CSignatures.get(srcElm.localName);
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
                            this.cRvars.set(rv, 1);
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
                        let bHiding = atts.getB('hiding'),
                            getVal = this.CompAttrExpr<string>(atts, 'value'),
                            caseNodes: Array<{
                                node: HTMLElement,
                                atts: Atts,
                                body: Iterable<ChildNode>,
                            }> = [],
                            body: ChildNode[] = [],
                            bThen: bool;
                        
                        for (let node of srcElm.childNodes) {
                            if (node.nodeType == Node.ELEMENT_NODE) 
                                switch (node.nodeName) {
                                    case 'THEN':
                                        bThen = 1;
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
                                not: boolean, // Not bool
                                patt?: {lvars: LVar[], regex: RegExp, url?: bool},
                                bldr: DOMBuilder, 
                                node: HTMLElement,
                            }> = [],
                            {wspc, rspc}= this,
                            postWs: WSpc = 0, elseWs=wspc;
                        
                        for (let {node, atts, body} of caseNodes) {
                            let saved = this.SaveCont();
                            this.wspc = wspc; this.rspc = rspc;
                            try {
                                let cond: Dependent<unknown> = n, 
                                    not: boolean = true, // Not bool
                                    patt:  {lvars: LVar[], regex: RegExp, url?: bool} = n,
                                    p: string;
                                switch (node.nodeName) {
                                    case 'WHEN':
                                    case 'IF':
                                    case 'THEN':
                                        cond = this.CompAttrExpr<unknown>(atts, 'cond');
                                        not = !atts.getB('not');
                                        patt =
                                            (p = atts.get('match')) != n
                                                ? this.CompPattern(p)
                                            : (p = atts.get('urlmatch')) != n
                                                ? this.CompPattern(p, 1)
                                            : (p = atts.get('regmatch')) != n
                                                ?  {regex: new RegExp(p, 'i'), 
                                                lvars: this.NewVars(atts.get('captures'))
                                                }
                                            : n;

                                        if (bHiding && patt?.lvars.length)
                                            throw `Pattern capturing cannot be combined with hiding`;
                                        if (patt && !getVal)
                                            throw `Match requested but no 'value' specified.`;

                                    // Fall through!
                                    case 'ELSE':
                                        caseList.push({cond, not, patt
                                            , bldr: await this.CompChildNodes(node, body)
                                            , node});
                                        atts.ChkNoAttsLeft();
                                        postWs = Math.max(postWs, this.wspc);
                                        if (not === u) elseWs=0;
                                        continue;
                                }
                            } 
                            catch (err) { throw (node.nodeName=='IF' ? '' : OuterOpenTag(node)) + err; }
                            finally { this.RestoreCont(saved) }
                        }
                        this.wspc = Math.max(postWs, elseWs)

                        bldr = 
                            async function CASE(this: RCompiler, area: Area) {
                                let value = getVal && getVal()
                                    , choosenAlt: typeof caseList[0] = n
                                    , matchResult: RegExpExecArray;
                                for (let alt of caseList)
                                    try {
                                        if ( !(
                                            (!alt.cond || alt.cond()) 
                                            && (!alt.patt || value!=n && (matchResult = alt.patt.regex.exec(value)))
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
                                        let {rng, childArea, bInit} = PrepElm(alt.node, area);
                                        if (    (!(rng.node.hidden = alt != choosenAlt)
                                                || bInit
                                                )
                                             && !area.bRootOnly)
                                            await this.CallWithHandling(alt.bldr, alt.node, childArea );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    let {sub, bInit} = PrepArea(srcElm, area, '', 1, choosenAlt);
                                    if (choosenAlt && (!area.bRootOnly || bInit)) {
                                        let saved = SaveEnv(), i = 0;
                                        try {
                                            if (choosenAlt.patt)
                                                for (let lv of choosenAlt.patt.lvars)
                                                    lv(
                                                        (choosenAlt.patt.url ? decodeURIComponent : (r: string) => r)
                                                        (matchResult[++i])
                                                    );

                                            await this.CallWithHandling(choosenAlt.bldr, choosenAlt.node, sub );
                                        } finally { RestoreEnv(saved) }
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
                        
                    case 'include': {
                        let src = atts.get('src', 1)
                        // Placeholder that will contain a Template when the file has been received
                            , C: RCompiler = new RCompiler(this);
                        C.FilePath = this.GetPath(src);
                        
                        let task = (async () => {
                            // Parse the contents of the file
                            // Compile the parsed contents of the file in the original context
                            await C.Compile(n, {bRunScripts: true}, await this.fetchModule(src));
                        })();

                        bldr = 
                            // Runtime routine
                            async function INCLUDE(this: RCompiler, area) {
                                let t0 = performance.now();
                                await task;
                                this.start += performance.now() - t0;
                                await C.Builder(area);
                            };
                    } break;

                    case 'import': {
                        let src = atts.get('src', 1)
                            , bIncl = atts.getB('include')
                            , vars: Array<LVar & {i?:number}> = this.NewVars(atts.get('defines'))
                            , bAsync = atts.getB('async')
                            , listImports = new Array<Signature>()
                            , promModule = RModules.get(src);   // Check whether module has already been loaded
                        
                        for (let child of srcElm.children) {
                            let sign = this.ParseSignat(child);
                            listImports.push(sign);
                        }

                        this.AddConstructs(listImports);
                            
                        if (!promModule) {
                            let C = new RCompiler(this, 1);
                            C.Settings.bRunScripts = true;
                            C.FilePath = this.GetPath(src);

                            promModule = this.fetchModule(src, 1).then(async nodes => {
                                let bldr = await C.CompIter(n, nodes);

                                // Check or register the imported signatures
                                for (let clientSig of listImports) {
                                    let signat = C.CSignatures.get(clientSig.nm);
                                    if (!signat)
                                        throw `<${clientSig.nm}> is missing in '${src}'`;
                                    if (bAsync && !clientSig.IsCompatible(signat))
                                        throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signat.srcElm.outerHTML}`;
                                }
                                for (let V of vars)
                                    if ((V.i = C.ContextMap.get(V.nm)) == u)
                                        throw `Module does not define '${V.nm}'`;
                                        
                                return [bldr.bind(C), C.CSignatures];

                            });
                            RModules.set(src, promModule);
                        }
                        if (!bAsync) {
                            let prom = promModule.then(([_, CSigns]) => {
                                for (let clientSig of listImports)
                                    Object.assign(clientSig, CSigns.get(clientSig.nm));
                            })
                            for (let clientSig of listImports)
                                clientSig.prom = prom;
                        }
                        
                        bldr = async function IMPORT(this: RCompiler, reg: Area) {
                            let [bldr] = await promModule
                                , saveEnv = env
                                , MEnv = env = NewEnv();
                            await bldr(bIncl ? reg : {parent: document.createDocumentFragment()});
                            env = saveEnv;
                            
                            for (let {nm} of listImports)
                                DefConstr(MEnv.constructs.get(nm));
                                
                            for (let lv of vars)
                                lv(MEnv[lv.i]);
                        };
                        isBl = 1;

                    } break;

                    case 'react': {
                        let getRvars = this.compAttrExprList<RVAR>(atts, 'on', 1)
                            , getHashes = this.compAttrExprList<unknown>(atts, 'hash')
                            , bodyBuilder = await this.CompChildNodes(srcElm);
                        
                        bldr = this.GetREACT(srcElm, 'on', bodyBuilder, getRvars, atts.getB('renew'));

                        if (getHashes) {
                            let b = bldr;
                            bldr = async function HASH(this: RCompiler, area: Area) {
                                let {sub, rng} = PrepArea(srcElm, area, 'hash')
                                    , hashes = getHashes();

                                if (!rng.value || hashes.some((hash, i) => hash !== rng.value[i])) {
                                    rng.value = hashes;
                                    await b.call(this, sub);
                                }
                            }
                            bldr.ws = b.ws;
                        }
                    } break;

                    case 'rhtml': {
                        let getSrctext = this.CompParam(atts, 'srctext', 1) as Dependent<string>
                        
                        //let imports = this.CompAttrExpr(atts, 'imports');
                            , modifs = this.CompAttribs(atts);
                        this.wspc=WSpc.block;
                        
                        bldr = async function RHTML(this: RCompiler, area) {
                            let srctext = getSrctext()
                            
                                , {rng, bInit} = PrepElm(srcElm, area, 'rhtml-rhtml')
                                , {node} = rng;
                            ApplyMods(node, modifs, bInit);

                            if (area.prevR || srctext != rng.result) {
                                rng.result = srctext;
                                let shadowRoot = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = document.createElement('rhtml'),
                                    svEnv = env,
                                    R = new RCompiler();

                                try {
                                    R.FilePath = this.FilePath;
                                    (R.head = shadowRoot).innerHTML = '';
                                    tempElm.innerHTML = srctext;
                                    await R.Compile(tempElm, {bRunScripts: true, bTiming: this.Settings.bTiming}, tempElm.childNodes);
                                    
                                    /* R.StyleBefore = sub.marker; */
                                    await R.Build({parent: shadowRoot, rng: n
                                        , parentR: new Range(n, n, 'Shadow')});
                                }
                                catch(err) {
                                    shadowRoot.appendChild(createErrNode(`Compile error: `+err))
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
                    case 'components':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBl = 1;
                        break;

                    case 'document': {
                        let docVar = this.NewV(atts.get('name', 1)),
                            RC = this,
                            saved = this.SaveCont();
                        try {
                            let
                                bEncaps = atts.getB('encapsulate'),
                                setVars = this.NewVars(atts.get('params')),
                                setWin = this.NewV(atts.get('window')),
                                docBuilder = await RC.CompChildNodes(srcElm);
                            bldr = async function DOCUMENT(this: RCompiler, area: Area) {
                                let {rng, bInit} = PrepArea(srcElm, area, docVar.name);
                                if (bInit) {
                                    let docEnv = CloneEnv(env)
                                    rng.value = {
                                        async render(W: Window, args: unknown[]) {
                                            let svEnv = env, i = 0;
                                            env = docEnv;
                                            for (let lv of setVars)
                                                lv(args[i++]);
                                            setWin(W);
                                            try {
                                                await docBuilder.call(RC, {parent: W.document.body}); 
                                            }
                                            finally {env = svEnv}
                                        },
                                        open(target?: string, features?: string, ...args: unknown[]) {
                                            let W = w.open('', target, features)
                                                , i = childWins.add(W);
                                            W.addEventListener('keydown', 
                                                function(this: Window,event:KeyboardEvent) {if(event.key=='Escape') this.close();}
                                            );
                                            W.addEventListener('close', () => childWins.delete(W))
                                            // Copy all style sheet rules
                                            if (!bEncaps)
                                                copyStyleSheets(document, W.document);
                                            this.render(W, args);
                                            return W;
                                        },
                                        async print(...args: unknown[]) {
                                            let iframe = document.createElement('iframe');
                                            iframe.setAttribute('style','display:none');
                                            document.body.appendChild(iframe);
                                            if (!bEncaps)
                                                copyStyleSheets(document, iframe.contentDocument);
                                            await this.render(iframe.contentWindow, args);
                                            iframe.contentWindow.print();
                                            iframe.remove();
                                        }
                                    };
                                    /*
                                    rng.wins = [];
                                    rng.onDest = () => {
                                        for (let W of rng.wins)
                                            if (W) W.close();
                                    }
                                    */
                                }
                                docVar(rng.value);
                            }
                            isBl = 1;
                        }
                        finally { this.RestoreCont(saved); }
                    } break;

                    case 'rhead': {
                        let childBuilder = await this.CompChildNodes(srcElm), {wspc} = this;
                        this.wspc = this.rspc = WSpc.block;
                        
                        bldr = async function HEAD(this: RCompiler, area: Area) {
                            let {sub, bInit} = PrepArea(srcElm, area);
                            sub.parent = area.parent.ownerDocument.head;
                            sub.before = n;
                            await childBuilder.call(this, sub);
                            if (bInit)
                                sub.prevR.newParent = sub.parent;
                        }
                        this.wspc = wspc;
                        isBl = 1;
                    } break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        bldr = await this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.ChkNoAttsLeft();
            }

            for (let g of genMods)
                g.hndlr = this.CompHandler(g.attNm, g.txt);
        }
        catch (err) { 
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
        if (!bldr) return n;
        if (depOnerr || depOnsucc) {
            let b = bldr;
            bldr = async function SetOnError(this: RCompiler, area: Area) {
                let save = {onerr, onsucc};
                try {
                    if (depOnerr) 
                        ((onerr = depOnerr()) as typeof onerr).bBldr = depOnerr.bBldr;
                    if (depOnsucc)
                        onsucc = depOnsucc();
                    await b.call(this, area);
                }
                finally { ({onerr,onsucc} = save); }
            }
        }
        if (genMods.length) {
            let b = bldr;
            bldr = async function ON(this: RCompiler, area: Area) {
                let r = area.rng;
                await b.call(this, area);
                for (let g of genMods) {
                    if (g.D && !r)
                        area.prevR.onDest = g.hndlr();
                    if (r ? g.U : g.C)
                        g.hndlr().call(
                            (r ? r.node : area.prevR?.node) 
                            || area.parent
                        );
                }
            }
        }
        if (dIf) {
            if (this.restoreActions.length > raLength)
                throw `'#IF' is not possible for declarations`;
            let b = bldr;
            bldr = function hif(this: RCompiler, area: Area) {
                let c = dIf(),
                    {sub} = PrepArea(srcElm, area, '', 1, !c)
                if (c)
                    return b.call(this, sub)
            }
        }

        for (let {attNm, rvars} of reacts)
            bldr = this.GetREACT(srcElm, attNm, bldr, rvars);
        elmBldr = function Elm(this: RCompiler, area: Area) {
            return this.CallWithHandling(bldr, srcElm, area);
        }
        elmBldr.ws = bldr.ws;
        return [elmBldr, srcElm];
    }

    private GetREACT(
        srcElm: HTMLElement, attName: string, 
        builder: DOMBuilder, 
        getRvars: Dependent<RVAR[]>,
        bRenew?: bool
    ): DOMBuilder{
        let  updateBuilder: DOMBuilder = 
            ( bRenew
                ? function renew(this: RCompiler, sub: Area) {
                    return builder.call(this, PrepArea(srcElm, sub, 'renew', 2).sub);
                }
            : /^this/.test(attName)
                ? function reacton(this: RCompiler, sub: Area) {
                    sub.bRootOnly = 1;
                    return builder.call(this, sub);
                }
            : builder
            );

        async function REACT(this: RCompiler, area: Area) {
            
            let rng: Range, sub: Area, bInit: bool;
            // All constructs should create at least one new range
            //if (getRvars) {
                ({rng, sub, bInit} = PrepArea(srcElm, area, attName));
                area = sub;
            //}

            if (bRenew)
                area = PrepArea(srcElm, area, 'renew', 2).sub;

            await builder.call(this, area);

            if (getRvars) {
                let rvars = getRvars()
                    , subs: Subscriber, pVars: RVAR[]
                    , i = 0;
                if (bInit)
                    subs = this.Subscriber(sub, updateBuilder, rng.child, );
                else {
                    ({subs, rvars: pVars} = rng);
                    assignEnv(subs.env, env);
                }
                rng.rvars = rvars; rng.subs = subs;
                for (let rvar of rvars) {
                    if (pVars) {
                        let pvar = pVars[i++];
                        if (rvar==pvar)
                            continue;
                        pvar._Subscribers.delete(subs);
                    }
                    try { rvar.Subscribe(subs); }
                    catch { throw `[${attName}] This is not an RVAR`; }
                }
            }
        }
        (REACT as DOMBuilder).ws = builder.ws;
        return REACT;
    }

    private async CallWithHandling(this: RCompiler, builder: DOMBuilder, srcNode: ChildNode, area: Area){
        let {rng} = area;
        if (rng && rng.errorNode) {
            area.parent.removeChild(rng.errorNode);
            rng.errorNode = u;
        }
        try {
            //await builder(area);
            return await builder.call(this, area);
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
                    rng.errorNode = errNode;    /* */
            }
        }
    }

    private async CompScript(this:RCompiler, srcParent: ParentNode, srcElm: HTMLScriptElement, atts: Atts) {
        //srcParent.removeChild(srcElm);
        let {type, text, defer, async} = srcElm
            , src = atts.get('src')     // Niet srcElm.src
            , defs = atts.get('defines')
            , bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type)
            , bCls = /^((text|application)\/javascript)?$/i.test(type)
            , mOto = /^otoreact(\/((local)|static))?\b/.exec(type)
            , sLoc = mOto && mOto[2]
            , bUpd = atts.getB('updating')
            , varlist = defs ? defs.split(',') : []
            , {context} = this
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
                return async function LSCRIPT(this: RCompiler, area: Area) {
                    let {rng, bInit} = PrepArea(srcElm, area);
                    exp = bUpd || bInit ? rng.result = (await prom)(env) : rng.result
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
                                    /(\sfrom\s*['"])([^'"]*)(['"])/g,
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
            if (lvName != n) { /* A regular iteration */
                let prevNm = atts.get('previous')
                    , nextNm = atts.get('next');
                if (prevNm == '') prevNm = 'previous';
                if (nextNm == '') nextNm = 'next';
                
                let getRange = this.CompAttrExpr<Iterable<Item> | Promise<Iterable<Item>>>(atts, 'of', 1),
                getUpdatesTo = this.CompAttrExpr<RVAR>(atts, 'updates'),
                bReacting = atts.getB('reacting') || atts.getB('reactive') || !!getUpdatesTo,
            
                // Voeg de loop-variabele toe aan de context
                loopVar = this.NewV(lvName),
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                ixVar = this.NewV(ixName),
                prevVar = this.NewV(prevNm),
                nextVar = this.NewV(nextNm),

                getKey = this.CompAttrExpr<Key>(atts, 'key'),
                getHash = this.CompAttrExpr<Hash>(atts, 'hash'),

                // Compileer alle childNodes
                bodyBldr = await this.CompChildNodes(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, area: Area) {
                    let {rng, sub} = PrepArea(srcElm, area, ''),
                        {parent} = sub,
                        before = sub.before !== u ? sub.before : rng.Next,
                        iterable = getRange()
                    
                        , pIter = async (iter: Iterable<Item>) => {
                        let svEnv = SaveEnv();
                        try {

                            // Map of previous data, if any
                            let keyMap: Map<Key, Range> = rng.value ||= new Map(),
                            // Map of the newly obtained data
                                newMap: Map<Key, {item:Item, hash:Hash, idx: number}> = new Map();
                            loopVar(); ixVar();

                            if (iter) {
                                if (!(iter[Symbol.iterator] || iter[Symbol.asyncIterator]))
                                    throw `[of]: Value (${iter}) is not iterable`;
                                let idx=0;
                                for await (let item of iter) {
                                    this.SetVar(loopVar,item);
                                    this.SetVar(ixVar, idx);
                                    let hash = getHash && getHash()
                                        , key = getKey?.() ?? hash;
                                    if (key != null && newMap.has(key))
                                        throw `Key '${key}' is not unique`;
                                    newMap.set(key ?? {}, {item, hash, idx});
                                    idx++;
                                }
                            }

                            let nextChild = rng.child,
                                iterator = newMap.entries(),
                                nextIterator = nextNm ? newMap.values() : null

                                , prevItem: Item, nextItem: Item
                                , prevRange: Range = null,
                                childArea: Area;
                            sub.parentR = rng;
                            prevVar(); nextVar();

                            if (nextIterator) nextIterator.next();

                            while(1) {
                                let k: Key, v = iterator.next().value;
                                while (nextChild && !newMap.has(k = nextChild.key)) {
                                    if (k != null)
                                        keyMap.delete(k);
                                    nextChild.erase(parent);
                                    nextChild.prev = null;
                                    nextChild = nextChild.next;
                                }

                                if (!v) break;
                                let [key, {item, hash, idx}] = v
                                    , childRange = keyMap.get(key), bInit = !childRange;

                                if (nextIterator)
                                    nextItem = nextIterator.next().value?.item;

                                if (bInit) {
                                    // Item has to be newly created
                                    sub.rng = null;
                                    sub.prevR = prevRange;
                                    sub.before = nextChild?.FirstOrNext || before;
                                    ({rng: childRange, sub: childArea} = PrepArea(null, sub, `${lvName}(${idx})`));
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
                                        parent.insertBefore(childRange.fragm, nextChild?.FirstOrNext || before);
                                        childRange.fragm = null;
                                    }
                                    else
                                        while (1) {
                                            if (nextChild == childRange)
                                                nextChild = nextChild.next;
                                            else {
                                                // Item has to be moved
                                                if (newMap.get(nextChild.key)?.idx > idx + 2) {
                                                    let fragm = nextChild.fragm = document.createDocumentFragment();
                                                    for (let node of nextChild.Nodes())
                                                        fragm.appendChild(node);
                                                    
                                                    nextChild = nextChild.next;
                                                    continue;
                                                }

                                                childRange.prev.next = childRange.next;
                                                if (childRange.next)
                                                    childRange.next.prev = childRange.prev;
                                                let nextNode = nextChild?.FirstOrNext || before;
                                                for (let node of childRange.Nodes())
                                                    parent.insertBefore(node, nextNode);
                                            }
                                            break;
                                        }

                                    childRange.next = nextChild;
                                    childRange.text = `${lvName}(${idx})`;

                                    if (prevRange) 
                                        prevRange.next = childRange;
                                    else
                                        rng.child = childRange;
                                    sub.rng = childRange;
                                    childArea = PrepArea(null, sub, '').sub;
                                    sub.parentR = null;
                                }
                                childRange.prev = prevRange;
                                prevRange = childRange;

                                if (hash == null
                                    ||  hash != childRange.hash as Hash
                                        && (childRange.hash = hash, 1)
                                ) {
                                    // Environment instellen
                                    let rvar: RVAR_Light<Item>;

                                    if (bReacting) {
                                        if (item === childRange.rvar)
                                            rvar = item;
                                        else {
                                            rvar = this.RVAR_Light(item as RVAR_Light<unknown>, getUpdatesTo && [getUpdatesTo()])
                                            if (childRange.rvar)
                                                rvar._Subscribers = childRange.rvar._Subscribers 
                                        }
                                    }
                                    
                                    this.SetVar(loopVar, rvar || item);
                                    this.SetVar(ixVar, idx);
                                    this.SetVar(prevVar, prevItem);
                                    this.SetVar(nextVar, nextItem);

                                    // Body berekenen
                                    await bodyBldr.call(this, childArea);

                                    if (rvar)
                                        if (childRange.rvar)
                                            assignEnv(childRange.iSub.env, env);
                                        else
                                            rvar.Subscribe(
                                                childRange.iSub = this.Subscriber(childArea, bodyBldr, childRange.child)
                                            );
                                    childRange.rvar = rvar
                                }

                                prevItem = item;
                            }
                            if (prevRange) prevRange.next = null; else rng.child = null;
                        }
                        finally { RestoreEnv(svEnv) }
                    }

                    if (iterable instanceof Promise) {
                        let subEnv = {env: CloneEnv(env), onerr,  onsucc},
                            rv = rng.rvar = RVAR(null, iterable, null, 
                                async () => {
                                    let save = {env, onerr, onsucc};
                                    ({env, onerr, onsucc} = subEnv);
                                    try { await pIter(rv.V); }
                                    finally {({env, onerr, onsucc} = save)}
                                }
                            );
                    }
                    else
                        await pIter(iterable);
                };
            }
            else { 
                /* Iterate over multiple slot instances */
                let nm = atts.get('of', 1, 1).toLowerCase()
                    , slot = this.CSignatures.get(nm);
                if (!slot)
                    throw `Missing attribute [let]`;

                let ixVar = this.NewV(ixName)
                    , bodyBldr = await this.CompChildNodes(srcElm);
                //srcParent.removeChild(srcElm);

                return async function FOREACH_Slot(this: RCompiler, area: Area) {
                    let {sub} = PrepArea(srcElm, area),
                        saved= SaveEnv(),
                        slotDef = env.constructs.get(nm);
                    ixVar();
                    try {
                        let idx = 0;
                        for (let slotBldr of slotDef.templates) {
                            this.SetVar(ixVar, idx++);
                            mapNm(env.constructs, {nm: nm, templates: [slotBldr], CEnv: slotDef.CEnv});
                            await bodyBldr.call(this, sub);
                        }
                    }
                    finally {
                        mapNm(env.constructs, slotDef);
                        RestoreEnv(saved);
                    }
                }
            }
        }
        finally { this.RestoreCont(saved) }
    }

    private CompDefine(srcElm: HTMLElement, atts: Atts): [DOMBuilder, string] {
        for (let C of srcElm.childNodes)
            if (C.nodeType!=Node.TEXT_NODE || !/^\s*$/.test((C as Text).data))
                throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
        let rv  = atts.get('rvar'),
            varNm     = rv || atts.get('let') || atts.get('var', 1),
            getVal    = this.CompParam(atts, 'value') || dU,
            getStore    = rv && this.CompAttrExpr<Store>(atts, 'store'),
            bReact      = atts.getB('reacting') || atts.getB('updating'),
            lv          = this.NewV(varNm);
        
        return [async function DEF(this: RCompiler, area) {
                let {rng, bInit} = PrepArea(srcElm, area);
                if (bInit || bReact){
                    let v = getVal();
                    if (rv)
                        if (bInit)
                            rng.value = new _RVAR(this.RC, null, v, getStore && getStore(), `RVAR_${rv}`);
                        else
                            rng.value._Set(v);
                    else
                        rng.value = v;
                }
                lv(rng.value);
            }, rv];

    }

    private ParseSignat(elmSignat: Element):  Signature {
        let signat = new Signature(elmSignat);
        for (let attr of elmSignat.attributes) {
            if (signat.RestParam) 
                throw `Rest parameter must be the last`;
            let m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                let param = { 
                    mode: m[1]
                    , nm: m[2]
                    , pDflt:
                        m[1] == '...' ? () => []
                        : attr.value != '' 
                        ? (m[1] == '#' ? this.CompJScript(attr.value, attr.name) :  this.CompString(attr.value, attr.name))
                        : m[3] ? /^on/.test(m[2]) ? ()=>_=>n : dU   // Unspecified default
                        : n 
                    }
                signat.Params.push(param);
                if (m[1] == '...')
                    signat.RestParam = param;
            }
        }
        for (let elmSlot of elmSignat.children)
            mapNm(signat.Slots, this.ParseSignat(elmSlot));
        return signat;
    }

    private async CompComponent(srcElm: HTMLElement, atts: Atts): Promise<DOMBuilder> {

        let builders: [DOMBuilder, ChildNode][] = [],
            bEncaps = atts.getB('encapsulate'),
            bRecurs = atts.getB('recursive'),
            styles: Node[] = [],
            {wspc} = this
            , signats: Array<Signature> = []
            , elmTempl: HTMLElement
            , bMultiple: bool;

        for (let child of Array.from(srcElm.children) as Array<HTMLElement>  ) {
            let childAtts = new Atts(child)
                , bldr: DOMBuilder;
            switch (child.nodeName) {
                case 'SCRIPT':
                    bldr = await this.CompScript(srcElm, child as HTMLScriptElement, childAtts);
                    break;
                case 'STYLE':
                    if (bEncaps)
                        styles.push(child);
                    else
                        this.CompStyle(child);
                    break;
                case 'DEFINE': case 'DEF':
                    [bldr] = this.CompDefine(child, childAtts);
                    break;
                case 'COMPONENT':
                    bldr = await this.CompComponent(child, childAtts);
                    break;
                case 'SIGNATURES':
                case 'SIGNATURE':
                    for (let elm of child.children)
                        signats.push(this.ParseSignat(elm));
                    break;
                case 'TEMPLATES':
                    bMultiple = 1;
                case 'TEMPLATE':
                    if (elmTempl) throw 'Double <TEMPLATE>';
                    elmTempl = child;
                    break;
                default:
                    if (signats.length) throw `Illegal child element <${child.nodeName}>`;
                    signats.push(this.ParseSignat(child));
                    break;
            }
            if (bldr) builders.push([bldr, child]);
        }
        if (!signats.length) throw `Missing signature(s)`;
        if (!elmTempl) throw 'Missing template(s)';

        if (bRecurs)
            this.AddConstructs(signats);
        
        let mapS = new Map<string, Signature>(signats.map(S => [S.nm, S]))
            , templates: Array<ConstructDef> = [];
        async function AddTemp(C: RCompiler, nm: string, prnt: ParentNode, elm: HTMLElement) {
            let S = mapS.get(nm);
            if (!S) throw `<${nm}> has no signature`;
            templates.push({nm, templates: [ await C.CompTemplate(signats[0], prnt, elm, 0, bEncaps, styles) ]})
            mapS.delete(nm);
        }
        if (bMultiple)
            for (let elm of elmTempl.children as Iterable<HTMLElement>)
                await AddTemp(this, elm.localName, elm, elm);
        else
            await AddTemp(this, signats[0].nm, (elmTempl as HTMLTemplateElement).content, elmTempl);
        for (let nm of mapS.keys())
            throw `Signature <${nm}> has no template`;

        if (!bRecurs)
           this.AddConstructs(signats);

        this.wspc = wspc;

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return async function COMPONENT(this: RCompiler, area: Area) {
            let constr: ConstructDef[] = templates.map(C => ({...C}));  // C must be cloned, as it will receive its own environment
            if (bRecurs)
                constr.forEach(DefConstr);
            let saved = SaveEnv();
            try {
                for (let [bldr, srcNode] of builders)
                    await this.CallWithHandling(bldr, srcNode, area);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs
                let CEnv = CloneEnv(env);
                for(let c of constr)
                    c.CEnv = CEnv;     // Contains circular reference to construct
            }
            finally { RestoreEnv(saved) }
            if (!bRecurs)
                constr.forEach(DefConstr);
        };
    }

    private async CompTemplate(signat: Signature, contentNode: ParentNode, srcElm: HTMLElement, 
        bNewNames: bool, bEncaps?: bool, styles?: Node[], atts?: Atts
    ): Promise<Template>
    {
        let 
            saved = this.SaveCont(),
            myAtts = atts || new Atts(srcElm),
            lvars: Array<[string, LVar]> = [];
        try {
            for (let {mode,nm} of signat.Params)
                lvars.push([nm, this.NewV((myAtts.get(mode + nm) ?? myAtts.get(nm, bNewNames)) || nm)]);

            this.AddConstructs(signat.Slots.values());

            if (!atts)
                myAtts.ChkNoAttsLeft();
            this.wspc = this.rspc = WSpc.block;
            let
                builder = await this.CompChildNodes(contentNode),
                {nm} = signat,
                customName = /^[A-Z].*-/.test(nm) ? nm : `rhtml-${nm}`;

            return async function TEMPLATE(this: RCompiler
                , area: Area, args: unknown[], mSlotTemplates, slotEnv
                ) {
                let saved = SaveEnv(), i = 0;
                try {
                    for (let [nm, templates] of mSlotTemplates)
                        DefConstr({nm, templates, CEnv: slotEnv});
                    
                    for (let [nm,lv] of lvars){
                        let arg = args[nm], dflt: Dependent<unknown>;
                        if (arg===u && (dflt = signat.Params[i]?.pDflt))
                            arg = dflt();
                        lv(arg);
                        i++;
                    }

                    if (bEncaps) {
                        let {rng: elmRange, childArea, bInit} = PrepElm(srcElm, area, customName), 
                            elm = elmRange.node,
                            shadow = elm.shadowRoot || elm.attachShadow({mode: 'open'});
                        if (bInit)
                            for (let style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        
                        if (signat.RestParam)
                            ApplyMod(elm, MType.RestArgument, null, args[signat.RestParam.nm], bInit);
                        childArea.parent = shadow;
                        area = childArea;
                    }
                    await builder.call(this, area); 
                }
                finally { RestoreEnv(saved) }
            }
        }
        catch (err) {throw `${OuterOpenTag(srcElm)} template: ${err}` }
        finally { this.RestoreCont(saved) }
    }


    private async CompInstance(
        srcElm: HTMLElement, atts: Atts,
        signat: Signature
    ) {
        if (signat.prom)
            await signat.prom;
        let {nm, RestParam} = signat,
            contSlot = signat.Slots.get('contents') || signat.Slots.get('content'),
            getArgs: Array<[string,Dependent<unknown>,Dependent<Handler>?]> = [],
            slotBldrs = new Map<string, Template[]>();

        for (let nm of signat.Slots.keys())
            slotBldrs.set(nm, []);

        for (let {mode, nm, pDflt} of signat.Params)
            if (mode=='@') {
                let attVal = atts.get(mode+nm, !pDflt);
                getArgs.push(
                    attVal
                    ? [nm, this.CompJScript<unknown>(attVal, mode+nm)
                        , this.CompJScript<Handler>(`ORx=>{${attVal}=ORx}`, nm)
                    ]
                    : [nm, u, ()=>dU ]
                )
            }
            else if (mode != '...') {
                let dH = this.CompParam(atts, nm, !pDflt);
                if (dH) getArgs.push([nm, dH]);
            }

        let slotElm: HTMLElement, Slot: Signature;
        for (let node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE 
                && (Slot = signat.Slots.get((slotElm = (node as HTMLElement)).localName))
            ) {
                slotBldrs.get(slotElm.localName).push(
                    await this.CompTemplate(Slot, slotElm, slotElm, 1)
                );
                srcElm.removeChild(node);
            }
            
        if (contSlot)
            slotBldrs.get(contSlot.nm).push(
                await this.CompTemplate(contSlot, srcElm, srcElm, 1, 0, n, atts)
            );

        if (RestParam) {
            let modifs = this.CompAttribs(atts);
            getArgs.push([RestParam.nm, 
                () => modifs.map(
                    ({mt, nm, depV}) => ({mt, nm, value: depV()})
                )]
            );
        }
        
        atts.ChkNoAttsLeft();
        this.wspc = WSpc.inline;

        return async function INSTANCE(this: RCompiler, area: Area) {
            let svEnv = env,
                cdef = env.constructs.get(nm),
                {rng, sub, bInit} = PrepArea(srcElm, area);
            if (!cdef) return;
            bReadOnly = 1;
            let args = rng.value ||= {};
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bInit)
                    args[nm] = RVAR('', dGet && dGet(), null, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            
            bReadOnly = 0;
            env = cdef.CEnv;
            try {
                for (let {nm, pDflt} of signat.Params)
                    if (args[nm] === u)
                        args[nm] = pDflt();
                for (let template of cdef.templates) 
                    await template.call(this, sub, args, slotBldrs, svEnv);
            }
            finally {env = svEnv;}
        }
    }

    static regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/;
    static regInline = /^(button|input|img)$/;
    private async CompHTMLElement(srcElm: HTMLElement, atts: Atts) {
        // Remove trailing dots
        let nm = srcElm.localName.replace(/\.+$/, ''),
            preWs = this.wspc
            , postWs: WSpc;

        if (this.mPreformatted.has(nm)) {
            this.wspc = WSpc.preserve; postWs = WSpc.block;
        }
        else if (RCompiler.regBlock.test(nm))
            postWs = this.wspc = this.rspc = WSpc.block;
        
        else if (RCompiler.regInline.test(nm)) {  // Inline-block
            this.wspc = this.rspc = WSpc.block;
            postWs = WSpc.inline;
        }
        
        if (preWs == WSpc.preserve)
            postWs = WSpc.preserve;

        // We turn each given attribute into a modifier on created elements
        let modifs = this.CompAttribs(atts)

        // Compile the given childnodes into a routine that builds the actual childnodes
            , childnodesBldr = await this.CompChildNodes(srcElm);

        if (postWs)
            this.wspc = postWs;

        // Now the runtime action
        let bldr: DOMBuilder = async function ELEMENT(this: RCompiler, area: Area) {
            let {rng: {node}, childArea, bInit} = PrepElm(srcElm, area, nm);
            
            if (!area.bRootOnly)
                // Build children
                await childnodesBldr.call(this, childArea);

            node.removeAttribute('class');
            if ((node as any).handlers)
                for (let {evType, listener} of (node as any).handlers)
                    node.removeEventListener(evType, listener);
            (node as any).handlers = [];
            ApplyMods(node, modifs, bInit);
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
            if (mt == MType.Prop)
                nm = altProps[nm] || nm;
            modifs.push({mt, nm, depV});
        }

        for (let [nm, V] of atts) {
            try {
                if (m = /(.*?)\.+$/.exec(nm))
                    addM(MType.Attr, nm, this.CompString(V, nm));
                else if (m = /^on(.*?)\.*$/i.exec(nm))               // Events
                    addM(MType.Event, CapitalProp(m[0]),
                        this.AddErrH(this.CompHandler(nm, V))
                    );
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    addM(MType.Class, m[1],
                        this.CompJScript<boolean>(V, nm)
                    );
                else if (m = /^#style\.(.*)$/.exec(nm))
                    addM(MType.Style, CapitalProp(m[1]),
                        this.CompJScript<unknown>(V, nm)
                    );
                else if (m = /^style\.(.*)$/.exec(nm))
                    addM(MType.Style, CapitalProp(m[1]),
                        this.CompString(V, nm)
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
                    let m2 = CapitalProp(m[2])
                        , setter: Dependent<Handler>;
                    if (m2 == 'class') m2 = 'className'
                    try {
                        setter = m[1]=='#' ? n : this.CompJScript<Handler>(
                            `function(){let ORx=this.${m2};if(${V}!==ORx)${V}=ORx}`, nm);
                    }
                    catch(err) { throw `Invalid left-hand side '${V}'`} 
                    
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript<Handler>(V, nm);
                        if (/^on/.test(m2))
                            addM(MType.Event, m2, this.AddErrH(depV as Dependent<Handler>));
                        else
                            addM(MType.Prop, m2, depV);
                    }
                    if (/\*/.test(m[1]))
                        addM(MType.oncreate, 'oncreate', setter);
                    if (/\+/.test(m[1]))
                        addM(MType.onupdate, 'onupdate', setter);
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
            , isTriv = 1 as bool, bThis: bool
            , lastIndex = regIS.lastIndex = 0
            , dep: Dependent<string> & {fixed?: string}
            , m: RegExpExecArray;

        while (1)
            if (!(m = regIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : n;
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
                    isTriv = 0;
                    bThis ||= getS.bThis;
                }
                lastIndex = regIS.lastIndex;
            }
        
        if (isTriv) {
            let s = (gens as Array<string>).join('');
            ((dep = () => s) as any).fixed = s
        } else
            dep = bThis ?
                function(this: HTMLElement) {
                    try {
                        let s = "";
                        for (let gen of gens)
                            s += typeof gen == 'string' ? gen : gen.call(this) ?? '';
                        return s;
                    }
                    catch (err) { throw nm ? `[${nm}]: ${err}` : err }
                }
            :   () => {
                try {
                    let s = "";
                    for (let gen of gens)
                        s += typeof gen == 'string' ? gen : gen() ?? '';
                    return s;
                }
                catch (err) { throw nm ? `[${nm}]: ${err}` : err }
            };
        dep.bThis = bThis;
        return dep;
    }

    // Compile a 'regular pattern' into a RegExp and a list of bound LVars
    private CompPattern(patt:string, url?: bool): {lvars: LVar[], regex: RegExp, url: bool}
    {
        let reg = '', lvars: LVar[] = []
        
        // These are the subpatterns that are need converting; all remaining characters are literals and will be quoted when needed
        , regIS =
            /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;

        while (regIS.lastIndex < patt.length) {
            let lastIndex = regIS.lastIndex
                , m = regIS.exec(patt)
                , literals = patt.substring(lastIndex, m.index);

            if (literals)
                reg += quoteReg(literals);
            reg +=
                m[1]     // A capturing group
                    ? (lvars.push(this.NewV(m[1])), `(.*?)`)
                : m[0] == '?'   ? '.'
                : m[0] == '*'   ? '.*'
                : m[2]          ? m[2] // An escaped character
                                : m[0] // A character class or "\{"
        }

        return {lvars, regex: new RegExp(`^${reg}$`, 'i'), url}; 
    }

    private CompParam(atts: Atts, attName: string, bReq?: bool): Dependent<unknown> {
        let v = atts.get(attName);
        return (
            v == n ? this.CompAttrExpr(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandler(attName, v)
            : this.CompString(v, attName)
        );
    }
    private CompAttrExpr<T>(atts: Atts, attName: string, bReq?: bool) {
        return this.CompJScript<T>(atts.get(attName, bReq, 1),attName);
    }

    private CompHandler(nm: string, text: string) {
        return /^#/.test(nm) ? this.CompJScript<Handler>(text, nm)
            : this.CompJScript<Handler>(`function(event){${text}\n}`, nm)
    }
    private CompJScript<T>(
        expr: string           // Expression to transform into a function
        , descrip?: string             // To be inserted in an errormessage
        , delims: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
    ): Dependent<T> {
        if (expr == n) return n;

        let bThis = /\bthis\b/.test(expr),
            depExpr = bThis ?
                `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
                : `'use strict';([${this.context}])=>(${expr}\n)`
            , errorInfo = `${descrip ? `[${descrip}] ` : ''}${delims[0]}${Abbrev(expr,60)}${delims[1]}: `;

        try {
            let rout = gEval(depExpr) as (env:Environment) => T
            , depV = (bThis
                ? function (this: HTMLElement) {
                        try { return rout.call(this, env); } 
                        catch (err) { throw errorInfo + err; }
                    }
                : () => {
                        try { return rout(env); } 
                        catch (err) { throw errorInfo + err; }
                    }
                ) as Dependent<T>;
            depV.bThis = bThis;
            return depV;
        }
        catch (err) { throw errorInfo + err }             // Compiletime error
    }
    private CompName(nm: string): Dependent<unknown> {
        let i = this.ContextMap.get(nm);
        if (i === u) throw `Unknown name '${nm}'`;
        return () => env[i];
    }
    private compAttrExprList<T>(atts: Atts, attName: string, bReacts?: bool): Dependent<T[]> {
        let list = atts.get(attName, 0, 1);
        if (!list) return n;
        if (bReacts)
            for (let nm of list.split(','))
                this.cRvars.set(nm.trim(), 0);
        return list ? this.CompJScript<T[]>(`[${list}\n]`, attName) : n;
    }

    private AddErrH(getHndlr: Dependent<Handler>): Dependent<Handler> {
        return () => {
            let hndlr = getHndlr(), sErr = onerr, sSuc = onsucc;
            if (hndlr && (sErr||sSuc))
                return function hError(this: HTMLElement, ev: Event) {
                    try {
                        let r = hndlr.call(this,ev);
                        if (r instanceof Promise)
                            return r.then(v => (sSuc(ev),v), sErr);
                        if (sSuc) sSuc(ev);
                        return r;
                    }
                    catch (err) {
                        if (!sErr) throw err;
                        sErr(err);
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

    async fetchModule(src: string, bInclHead?: bool): Promise<Iterable<ChildNode>> {
        let mod = document.getElementById(src);
        if (!mod) {
            let doc = parser.parseFromString(await this.FetchText(src), 'text/html') as Document;
            mod = doc.body;
            if (mod.firstElementChild.tagName == 'MODULE')
                mod = mod.firstElementChild as HTMLElement;

            if (bInclHead)
                return concIterable(doc.head.childNodes, mod.childNodes)
        }
        return mod.childNodes;
    }
}

export async function RFetch(input: RequestInfo, init?: RequestInit) {
    let r = await gFetch(input, init);
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
        public name?: string, 
        initialValue?: T | Promise<T>, 
        public store?: Store,
        private storeName?: string,
    ) {
        if (name) globalThis[name] = this;
        
        let s = store && store.getItem(this._sNm);
        if (s != null)
            try {
                this._val = JSON.parse(s);
                return;
            }
            catch{}

        this._Set(initialValue);
    }
    // The value of the variable
    private _val: T;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    _Subscribers: Set<Subscriber<T>> = new Set();
    auto: Subscriber;
    private get _sNm() {return this.storeName || `RVAR_${this.name}`}

    Subscribe(s: Subscriber<T>, bImmediate?: bool, bInit: bool = bImmediate) {
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
            ( (this.V = u), t.then(v => (this.V = v), onerr))
            : (this.V = t);
    }
    get Set() {
        return this._Set.bind(this);
    }
    get Clear() {
        return () => {this.V=u};
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { 
        if (!bReadOnly) this.SetDirty();  
        return this._val }
    set U(t: T) { this._val = t; this.SetDirty(); }

    public SetDirty() {
        this.RC.DirtyVars.add(this);
        for (let sub of this._Subscribers)
            if (sub.bImm)
                sub(this._val);
        this.RC.RUpdate();
    }

    public Save() {
        this.store.setItem(this._sNm, JSON.stringify(this._val));
    }
}
export interface RVAR<T = unknown> extends _RVAR<T> {}

class Atts extends Map<string,string> {
    constructor(elm: HTMLElement) {
        super();
        for (let att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }

    public get(nm: string, bRequired?: bool, bHashAllowed?: bool) {
        let n = nm, v = super.get(n);
        if (v==null && bHashAllowed) {
            n = '#' + nm;
            v = super.get(n);
        }
        if (v != null)
            super.delete(n);
        else if (bRequired)
            throw `Missing attribute [${nm}]`;
        return v;
    }
    public getB(nm: string): boolean { 
        let v = this.get(nm),
            m = /^((false)|true)?$/i.exec(v);
        if (v!=n) {
            if (!m) throw `@${nm}: invalid value`;
            return !m[2];
        }
    }

    public ChkNoAttsLeft() {  
        if (super.size)
            throw `Unknown attribute${super.size > 1 ? 's' : ''}: ${Array.from(super.keys()).join(',')}`;
    }
}

let altProps = {"class": "className", valueAsNumber: "value"}
    , regIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/
    , regReserv = /^(?:break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/
// Capitalization of event names, element property names, and style property names.
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
    , words = 'access|active|align|animation|aria|as|backface|background|basis|blend|border|bottom|box|bounding|break|caption|caret|character|child|class|client|clip|column|(?:col|row)(?=span)|content|counter|css|decoration|default|design|document|element|empty|feature|fill|first|flex|font|form|get|grid|hanging|image|inner|input(?=mode)|^is|hanging|last|left|letter|line|list|margin|^max|^min|^nav|next|node|object|offset|outer|outline|overflow|owner|padding|page|parent|perspective|previous|ready?|right|size|rule|scroll|selected|selection|table|tab(?=index)|tag|text|top|transform|transition|unicode|user|validation|value|variant|vertical|white|will|word|^z'
// Not: auto, on
// Beware of spcial cases like "inputmode" and "tabindex"
// "valueAsNumber" has "as" as word, but "basis" not
// Better not use lookbehind assertions (https://caniuse.com/js-regexp-lookbehind):
    , regCapit = new RegExp(`(html|uri)|(${words})|.`, "g");

function CheckIdentifier(nm: string) {
    // Anders moet het een geldige JavaScript identifier zijn
    if (!regIdent.test(nm) )
        throw `Invalid identifier '${nm}'`;
    if (regReserv.test(nm))
        throw `Reserved keyword '${nm}'`;
    return nm;
}

function CapitalProp(lcName: string) {
    let bHadW:boolean;
    return lcName.replace(regCapit, (w, p1, p2) => {
        let r = 
            p1 ? w.toUpperCase()
            : bHadW ? w.substring(0,1).toUpperCase() + w.substring(1)
            : w;
        bHadW = p2;
        return r;
    });
}

function OuterOpenTag(elm: HTMLElement, maxLen?: number): string {
    return Abbrev(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLen-1) + '>';
}
function Abbrev(s: string, maxLen: number) {
    return (maxLen && s.length > maxLen
        ? s.substring(0, maxLen - 3) + "..."
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

function* concIterable<T>(R: Iterable<T>, S:Iterable<T>)  {
    for (let x of R) yield x;
    for (let x of S) yield x;
}

//function thrower(err: string = 'Internal error'): never { throw err }

function createErrNode(msg: string) {
    let n = document.createElement('div');        
    n.style.color = 'crimson';
    n.style.fontFamily = 'sans-serif';
    n.style.fontSize = '10pt';
    n.innerText = msg;
    return n;
}

function copyStyleSheets(S: Document, D: Document) {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules) 
            DSheet.insertRule(rule.cssText);
    }
}


Object.defineProperties(
    globalThis, {
        RVAR:       {get: () => R.RVAR.bind(R)},
        RUpdate:    {get: () => R.RUpdate.bind(R)},
    }
);
let _rng = globalThis.range = function* range(from: number, count?: number, step: number = 1) {
	if (count === u) {
		count = from;
		from = 0;
	}
	for (let i=0;i<count;i++)
		yield from + i * step;
}
globalThis.RCompile = RCompile;
export let 
    R = new RCompiler(),
    RVAR = globalThis.RVAR as <T>(name?: string, initialValue?: T|Promise<T>, store?: Store, subs?: Subscriber, storeName?: string) => RVAR<T>, 
    RUpdate = globalThis.RUpdate as () => void,
    docLocation: RVAR<string> & 
        {   basepath: string;
            subpath: string; 
            searchParams: URLSearchParams;
            search: (key: string, value: string) => void
        }
        = RVAR<string>('docLocation', location.href) as any,
    reroute = globalThis.reroute = 
        (arg: MouseEvent | string) => {
            if (typeof arg == 'object') {
                if (arg.ctrlKey)
                    return;
                arg.preventDefault();
                arg = (arg.target as HTMLAnchorElement).href;
            }
            docLocation.V = new URL(arg, location.href).href;
        };

export {_rng as range};
Object.defineProperty(docLocation, 'subpath', {get: () => location.pathname.substring(docLocation.basepath.length)});
docLocation.search = 
    (key: string, val: string) => {
        let url = new URL(location.href);
        if (val == null)
            url.searchParams.delete(key);
        else
            url.searchParams.set(key, val);
        return url.href;
    };
docLocation.Subscribe( loc => {
    if (loc != location.href)
        history.pushState(null, null, loc);
    
    docLocation.searchParams = new URLSearchParams(location.search);
    ScrollToHash();
}, 1);

w.addEventListener('popstate', () => {docLocation.V = location.href;} );

function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substring(1))?.scrollIntoView()), 6);
}

setTimeout(() =>
    /^rhtml$/i.test(document.body.getAttribute('type'))
        && RCompile(document.body)
, 0);