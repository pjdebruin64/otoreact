// Global settings 
let defaultSettings = {
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
, parser = new DOMParser()
, gEval = eval, gFetch=fetch
, u = undefined;

// A DOMBUILDER is the semantics of a piece of RHTML.
// It can both build (construct) a new piece of DOM, and update an existing piece of DOM.
type DOMBuilder = ((reg: Area) => Promise<void>) & {ws?: boolean; auto?: boolean};
const enum WSpc {block = 1, inlineSpc, inline, preserve}

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
    bRootOnly?: boolean,        // true == just update the root node, not its children
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
    & { constructs: Map<string, ConstructDef>,
    };

// A  DEPENDENT value of type T in a given context is a routine computing a T using an environment for that context.
// It may carry an indicator that the routine might need a value for 'this'.
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dependent<T> = (() => T) & {bThis?: boolean};
let dU: Dependent<any> = () => u;

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
        if (srcElm) text = srcElm.localName + (text && ' ') + text;
        
        UpdPrevRange(area, range = subArea.parentR = new Range(null, area, text));
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
function UpdPrevRange(area: Area, range: Range) {
    let r: Range
    if (r = area.prevR) 
        r.next = range;
    else if (r = area.parentR)
        r.child = range;

    area.prevR = range;
}

function PrepElm<T={}>(srcElm: HTMLElement, area: Area, nodeName = srcElm.nodeName): 
    {range: Range<HTMLElement> & T, childArea: Area, bInit: boolean} {
    let range = area.range as Range<HTMLElement> & T, bInit = !range;
    if (bInit) {
        range = new Range(
            area.source == srcElm
                ? (srcElm.innerHTML = "", srcElm)
                : area.parent.insertBefore<HTMLElement>(document.createElement(nodeName), area.before)
            , area
            ) as Range<HTMLElement> & T;
        UpdPrevRange(area, range);
    }
    else
        area.range = range.next
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
    if (!range)
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
        range.node.data = content;
        area.range = range.next;
    }
}

type FullSettings = typeof defaultSettings;
type Settings = Partial<FullSettings>;
let ToBuild: Area[] = [];

export async function RCompile(elm: HTMLElement, settings?: Settings): Promise<void> { 
    try {
        let {basePattern} = R.Settings = {...defaultSettings, ...settings},
            m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (
            docLocation.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : ''
        )
        R.RootElm = elm;
        await R.Compile(elm, {}, true);
        ToBuild.push({parent: elm.parentElement, source: elm, range: null});

        if (R.Settings.bBuild)
            await RBuild();
    }
    catch (err) {
        window.alert(`OtoReact error: `+err);
    }
}

export async function RBuild() {
    R.start = performance.now();
    builtNodeCnt = 0;
    try {
        for (let area of ToBuild)
            await R.Build(area);
        R.logTime(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        window.alert(`OtoReact error: `+err);
    }
    ToBuild = [];
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
        bImm?: boolean;
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
    public RestParam: Parameter = null;
    public Slots = new Map<string, Signature>();

    // Check whether an import signature is compatible with the real module signature
    IsCompatible(sig: Signature): boolean {
        if (!sig) return false;
        let r: any = true,
            mapSigParams = new Map(sig.Params.map(p => [p.nm, p.pDflt]));
        // All parameters in the import must be present in the module
        for (let {nm, pDflt} of this.Params)
            if (mapSigParams.has(nm)) {
                // When optional in the import, then also optional in the module
                r &&= (!pDflt || mapSigParams.get(nm));
                mapSigParams.delete(nm);
            }
            else r = false
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
type ConstructDef = {nm: string, templates: Template[], constructEnv?: Environment};
type Template = 
    (this: RCompiler, area: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment)
    => Promise<void>;

export type RVAR_Light<T> = T & {
    _Subscribers?: Set<Subscriber>;
    _UpdatesTo?: Array<RVAR>;
    Subscribe?: (sub:Subscriber) => void;
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
function DefConstruct(C: ConstructDef) {
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

    private cRvars = new Map<string,boolean>();

    private head: Node;
    private StyleBefore: ChildNode;
    private AddedHdrElms: Array<HTMLElement>;
    public FilePath: string;
    public RootElm: ParentNode;
 
    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(
        RC?: RCompiler,
        bClr?: boolean
    ) { 
        this.Settings   = RC ? {...RC.Settings} : {...defaultSettings};
        this.RC = RC ||= this;
        this.FilePath   = RC.FilePath;
        this.head  = RC.head || document.head;
        if (bClr) RC=this;
        this.context    = RC?.context || "";
        this.ContextMap = RC ? new Map(RC.ContextMap) : new Map();
        this.CSignatures = RC ? new Map(RC.CSignatures) : new Map();
        this.AddedHdrElms = RC.AddedHdrElms || [];
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

    private NewVar(nm: string): LVar {
        let lv: LVar;
        if (!nm)
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
           lv = ((_: unknown) => {}) as LVar;
        else {
            nm = CheckIdentifier(nm);

            let i = this.ContextMap.get(nm);
            if (i == null){
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
            ? varlist.split(',')
                .map(nm => this.NewVar(nm))
            : []
            );
    }

    private AddConstruct(S: Signature) {
        let savedC = this.CSignatures.get(S.nm);
        mapNm(this.CSignatures, S);
        this.restoreActions.push(() => 
            mapSet(this.CSignatures, S.nm, savedC)
        );
    }

    // Compile a source tree into an ElmBuilder
    public async Compile(
        elm: ParentNode, 
        settings: Settings = {},
        bIncludeSelf: boolean = false,  // Compile the element itself, or just its childnodes
    ) {
        let t0 = performance.now(), savedR = R;
        Object.assign(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.mPreformatted.add(tag.toLowerCase());
        try {
            R = this;
            this.Builder =
                bIncludeSelf
                ? (await this.CompElm(elm.parentElement, elm as HTMLElement, true))[0]
                : await this.CompChildNodes(elm);
            this.bCompiled = true;
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
        
    Subscriber({parent, bRootOnly}: Area, builder: DOMBuilder, range: Range, ...args ): Subscriber {
        if (range)
            range.updated = updCnt;
        let sArea: Area = {
                parent, bRootOnly,
                range,
            },
            subEnv = {env: CloneEnv(env), onerr, onsucc},
            subscriber: Subscriber = async () => {
                let {range} = sArea, save = {env, onerr, onsucc};
                if (!range.erased && (range.updated || 0) < updCnt) {
                    ({env, onerr, onsucc} = subEnv);
                    range.updated = updCnt;
                    builtNodeCnt++;
                    try {
                        await builder.call(this, {...sArea}, ...args);
                    }
                    finally {({env, onerr, onsucc} = save)}
                }
            };
        subscriber.sArea = sArea;
        subscriber.ref = range;
        subscriber.env = subEnv.env;

        return subscriber;
    }

    public async Build(area: Area) {
        let saveR = R, {parentR} = area;
        R = this;
        env = NewEnv();
        builtNodeCnt++;
        await this.Builder(area);
        let subs = this.Subscriber(area, this.Builder, parentR?.child || area.prevR);
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
            let saveR = R, subs = this.DirtySubs;
            try {
                for (let rvar of this.DirtyVars)
                    rvar.Save();
                this.DirtyVars.clear();
                
                if (subs.size) {
                    R = this;
                    this.start = performance.now();
                    builtNodeCnt = 0;
                    this.DirtySubs = new Map();
                    for (let sub of subs.values())
                        try { await sub(); }
                        catch (err) {
                            let msg = `ERROR: `+err;
                            console.log(msg);
                            window.alert(msg);
                        }
                    
                    this.logTime(`${R.num}: Updated ${builtNodeCnt} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
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
        nm?: string, 
        value?: T | Promise<T>, 
        store?: Store,
        subs?: (t:T) => void,
        storeName?: string
    ) {
        let r = new _RVAR<T>(this.RC, nm, value, store, storeName);
        if (subs)
            r.Subscribe(subs, true, false);
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
                            for (let sub of t._Subscribers)
                                RC.AddDirty(sub);
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
                            [ async (area:Area)=> PrepCharData(area, getText(), true), srcNode, 1]
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

        if (!builders.length) return null;
        let Iter: DOMBuilder = 
            async function Iter(this: RCompiler, area: Area, start: number = 0)
                // start > 0 is use
            {                
                let i=0, toSubscribe: Array<Subscriber> = [];
                if (!area.range) {
                    for (let [bldr] of builders) {
                        i++;
                        await bldr.call(this, area);
                        if (bldr.auto)  // Auto subscribe?
                            toSubscribe.push(this.Subscriber(area, Iter, area.prevR, i)); // Not yet the correct range, we need the next range
                    }
                    for (let subs of toSubscribe) {
                        let {sArea} = subs, r = sArea.range, rvar = r.value as RVAR;
                        if (!rvar._Subscribers.size && r.next) // No subscribers yet?
                        {   // Then subscribe with the correct range
                            (sArea.range = r.next).updated = 0;
                            subs.ref = {};
                            rvar.Subscribe(rvar.auto = subs);
                        }
                    }
                } else
                    for (let [bldr] of builders)
                        if (i++ >= start) {
                            let r = area.range;
                            await bldr.call(this, area);
                            if (bldr.auto && r.value.auto)  // Auto subscribe?
                                assignEnv((r.value as RVAR).auto.env, env);
                        }
                
                builtNodeCnt += builders.length - start;
            };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }

    static genAtts = /^#?(?:((?:this)?reacts?on)|on(create|update)+|on(?:(error)-?|success))$/;
    private async CompElm(srcPrnt: ParentNode, srcElm: HTMLElement, bUnhide?: boolean
        ): Promise<[DOMBuilder, ChildNode, number?]> {
        let atts =  new Atts(srcElm),
            reacts: Array<{attNm: string, rvars: Dependent<RVAR[]>}> = [],
            genMods: Array<{attNm: string, text: string, hndlr?: Dependent<Handler>, C?: boolean, U?: boolean}> = [],
            
            depOnerr: Dependent<Handler> & {bBldr?: boolean}
            , depOnsucc: Dependent<Handler>
            , bldr: DOMBuilder, elmBldr: DOMBuilder, isBlank: number
            , m: RegExpExecArray;
        if (bUnhide) atts.set('#hidden', 'false');        
        try {
            for (let attNm of atts.keys())
                if (m = RCompiler.genAtts.exec(attNm))
                    if (m[1])       // (?:this)?reacts?on)
                        reacts.push({attNm, rvars: this.compAttrExprList<RVAR>(atts, attNm, true)});
                    else if (m[2])  // #?on(create|update)+
                        genMods.push({attNm, text: atts.get(attNm), C:/c/.test(attNm), U:/u/.test(attNm)});
                    else {          // #?on(?:(error)-?|success)
                        let dep = this.CompHandler(attNm, atts.get(attNm));
                        if (m[3])   // #?onerror-?
                            ((depOnerr = dep) as typeof depOnerr).bBldr = !/-$/.test(attNm);
                        else depOnsucc = dep;
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
                            this.cRvars.set(rv, true);
                            this.restoreActions.push(() => {
                                // Possibly auto-subscribe when there were no compile-time subscribers
                                if (elmBldr) elmBldr.auto = this.cRvars.get(rv);
                                this.cRvars.set(rv, a);
                            });
                        }
                        
                        isBlank = 1;
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
                            bThen = false;
                        
                        for (let node of srcElm.childNodes) {
                            if (node.nodeType == Node.ELEMENT_NODE) 
                                switch (node.nodeName) {
                                    case 'THEN':
                                        bThen = true;
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
                                not?: boolean,
                                patt?: {lvars: LVar[], regex: RegExp, url?: boolean},
                                builder: DOMBuilder, 
                                node: HTMLElement,
                            }> = [],
                            {wspc, rspc}= this,
                            postWs: WSpc = 0, elseWs=wspc;
                        
                        for (let {node, atts, body} of caseNodes) {
                            let saved = this.SaveCont();
                            this.wspc = wspc; this.rspc = rspc;
                            try {
                                let cond: Dependent<unknown> = null, not: boolean = false,
                                    patt:  {lvars: LVar[], regex: RegExp, url?: boolean} = null,
                                    p: string;
                                switch (node.nodeName) {
                                    case 'WHEN':
                                    case 'IF':
                                    case 'THEN':
                                        cond = this.CompAttrExpr<unknown>(atts, 'cond');
                                        not = atts.getB('not') || false;
                                        patt =
                                            (p = atts.get('match')) != null
                                                ? this.CompPattern(p)
                                            : (p = atts.get('urlmatch')) != null
                                                ? this.CompPattern(p, true)
                                            : (p = atts.get('regmatch')) != null
                                                ?  {regex: new RegExp(p, 'i'), 
                                                lvars: (atts.get('captures')?.split(',') || []).map(this.NewVar.bind(this))
                                                }
                                            : null;

                                        if (bHiding && patt?.lvars.length)
                                            throw `Pattern capturing cannot be combined with hiding`;
                                        if (patt && !getVal)
                                            throw `Match requested but no 'value' specified.`;

                                    // Fall through!
                                    case 'ELSE':
                                        caseList.push({cond, not, patt
                                            , builder: await this.CompChildNodes(node, body)
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
                                    , choosenAlt: typeof caseList[0] = null
                                    , matchResult: RegExpExecArray;
                                for (let alt of caseList)
                                    try {
                                        if ( !(
                                            (!alt.cond || alt.cond()) 
                                            && (!alt.patt || value!=null && (matchResult = alt.patt.regex.exec(value)))
                                            ) == alt.not)
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
                                        let {range, childArea, bInit} = PrepElm(alt.node, area);
                                        if (    (!(range.node.hidden = alt != choosenAlt)
                                                || bInit
                                                )
                                             && !area.bRootOnly)
                                            await this.CallWithHandling(alt.builder, alt.node, childArea );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    let {subArea, bInit} = PrepArea(srcElm, area, '', 1, choosenAlt);
                                    if (choosenAlt && (bInit || !area.bRootOnly)) {
                                        let saved = SaveEnv(), i = 0;
                                        try {
                                            if (choosenAlt.patt)
                                                for (let lv of choosenAlt.patt.lvars)
                                                    lv(
                                                        (choosenAlt.patt.url ? decodeURIComponent : (r: string) => r)
                                                        (matchResult[++i])
                                                    );

                                            await this.CallWithHandling(choosenAlt.builder, choosenAlt.node, subArea );
                                        } finally { RestoreEnv(saved) }
                                    }
                                }
                        }
                    } break;
                            
                    case 'for':
                    case 'foreach':
                        bldr = await this.CompFor(srcElm, atts);
                    break;
                        
                    case 'include': {
                        let src = atts.get('src', true)
                        // Placeholder that will contain a Template when the file has been received
                            , C: RCompiler = new RCompiler(this);
                        C.FilePath = this.GetPath(src);
                        
                        let task = (async () => {
                            // Parse the contents of the file
                            // let parsedContent = parser.parseFromString(await this.FetchText(src), 'text/html');

                            // Compile the parsed contents of the file in the original context
                            await C.Compile(parser.parseFromString(await this.FetchText(src), 'text/html').body, {bRunScripts: true}, false);
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
                        let src = atts.get('src', true)
                            , bIncl = atts.getB('include')
                            , vars: Array<LVar & {i?:number}> = this.NewVars(atts.get('defines'))
                            , bAsync = atts.getB('async')
                            , listImports = new Array<Signature>()
                            , promModule = RModules.get(src);   // Check whether module has already been loaded
                        
                        for (let child of srcElm.children) {
                            let sign = this.ParseSignat(child);
                            listImports.push(sign);
                            this.AddConstruct(sign);
                        }
                            
                        if (!promModule) {
                            let C = new RCompiler(this, true);
                            C.Settings.bRunScripts = true;

                            let mod = document.getElementById(src);
                            promModule = mod
                            ? processModule(mod.childNodes)
                            : this.FetchText(src)
                            .then(textContent => {
                                // Parse the contents of the file
                                let
                                    parsedDoc = parser.parseFromString(textContent, 'text/html') as Document,
                                    {body} = parsedDoc as {body: Element};
                                    
                                if (body.firstElementChild.tagName == 'MODULE')
                                    body = body.firstElementChild;

                                C.FilePath = this.GetPath(src);
                                return processModule(
                                        concIterable(parsedDoc.head.childNodes, body.childNodes)
                                    );
                            });
                            RModules.set(src, promModule);


                            async function processModule(nodes: Iterable<ChildNode>): Promise<[DOMBuilder,Map<string, Signature>]> {
                                let bldr = await C.CompIter(null, nodes);

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
                            }
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
                                DefConstruct(MEnv.constructs.get(nm));
                                
                            for (let lv of vars)
                                lv(MEnv[lv.i]);
                        };
                        isBlank = 1;

                    } break;

                    case 'react': {
                        let getRvars = this.compAttrExprList<RVAR>(atts, 'on', true)
                            , getHashes = this.compAttrExprList<unknown>(atts, 'hash')
                            , bodyBuilder = await this.CompChildNodes(srcElm);
                        
                        bldr = this.GetREACT(srcElm, 'on', bodyBuilder, getRvars, atts.getB('renew'));

                        if (getHashes) {
                            let b = bldr;
                            bldr = async function HASH(this: RCompiler, area: Area) {
                                let {subArea, range} = PrepArea(srcElm, area, 'hash')
                                    , hashes = getHashes();

                                if (!range.value || hashes.some((hash, i) => hash !== range.value[i])) {
                                    range.value = hashes;
                                    await b.call(this, subArea);
                                }
                            }
                            bldr.ws = b.ws;
                        }
                    } break;

                    case 'rhtml': {
                        let getSrctext = this.CompParam(atts, 'srctext', true) as Dependent<string>
                        
                        //let imports = this.CompAttrExpr(atts, 'imports');
                            , modifs = this.CompAttribs(atts);
                        this.wspc=WSpc.block;
                        
                        bldr = async function RHTML(this: RCompiler, area) {
                            let srctext = getSrctext()
                            
                                , {range, bInit} = PrepElm<{hdrElms: ChildNode[]}>(srcElm, area, 'rhtml-rhtml')
                                , {node} = range;
                            ApplyMods(node, modifs, bInit);

                            if (area.prevR || srctext != range.result) {
                                range.result = srctext;
                                let shadowRoot = node.shadowRoot || node.attachShadow({mode: 'open'}),
                                    tempElm = document.createElement('rhtml'),
                                    svEnv = env,
                                    R = new RCompiler();

                                try {
                                    tempElm.innerHTML = srctext;
                                    if (range.hdrElms) {
                                        for (let elm of range.hdrElms) elm.remove();
                                        range.hdrElms = null;
                                    }
                                    R.FilePath = this.FilePath;
                                    (R.head = shadowRoot).innerHTML = '';
                                    await R.Compile(tempElm, {bRunScripts: true, bTiming: this.Settings.bTiming}, false);
                                    range.hdrElms = R.AddedHdrElms;
                                    
                                    /* R.StyleBefore = subArea.marker; */
                                    await R.Build({parent: shadowRoot, range: null
                                        , parentR: new Range(null, null, 'Shadow')});
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
                        isBlank = 1;
                        break;

                    case 'style':
                        this.CompStyle(srcElm);
                        isBlank = 1;
                        break;

                    case 'component': 
                        bldr = await this.CompComponent(srcElm, atts);
                        isBlank = 1;
                        break;

                    case 'document': {
                        let docVar = this.NewVar(atts.get('name', true)),
                            RC = this,
                            saved = this.SaveCont();
                        try {
                            let
                                bEncaps = atts.getB('encapsulate'),
                                setVars = this.NewVars(atts.get('params')),
                                setWin = this.NewVar(atts.get('window')),
                                docBuilder = await RC.CompChildNodes(srcElm),
                                docDef = (docEnv: Environment) => {
                                    docEnv = CloneEnv(docEnv);
                                    return {
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
                                            let W = window.open('', target, features);
                                            W.addEventListener('keydown', 
                                                function(this: Window,event:KeyboardEvent) {if(event.key=='Escape') this.close();}
                                            );
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
                                    }
                                }
                            bldr = async function DOCUMENT(this: RCompiler) {
                                docVar(docDef(env));
                            }
                            isBlank = 1;
                        }
                        finally { this.RestoreCont(saved); }
                    } break;

                    case 'rhead': {
                        let childBuilder = await this.CompChildNodes(srcElm), {wspc} = this;
                        this.wspc = this.rspc = WSpc.block;
                        
                        bldr = async function HEAD(this: RCompiler, area: Area) {
                            let sub: Area = PrepArea(srcElm, area).subArea;
                            sub.parent = area.parent.ownerDocument.head;
                            await childBuilder.call(this, sub);
                        }
                        this.wspc = wspc;
                        isBlank = 1;
                    } break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        bldr = await this.CompHTMLElement(srcElm, atts); 
                        break;
                }
                atts.ChkNoAttsLeft();
            }

            for (let g of genMods)
                g.hndlr = this.CompHandler(g.attNm, g.text);
        }
        catch (err) { 
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
        if (!bldr) return null;
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
                let r = area.range;
                await b.call(this, area);
                for (let g of genMods)
                    if (r ? g.U : g.C)
                        g.hndlr().call(
                            (r ? r.node : area.prevR?.node) 
                            || area.parent
                        );
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
        bRenew=false
    ): DOMBuilder{
        let  updateBuilder: DOMBuilder = 
            ( bRenew
                ? function renew(this: RCompiler, subArea: Area) {
                    return builder.call(this, PrepArea(srcElm, subArea, 'renew', 2).subArea);
                }
            : /^this/.test(attName)
                ? function reacton(this: RCompiler, subArea: Area) {
                    subArea.bRootOnly = true;
                    return builder.call(this, subArea);
                }
            : builder
            );

        async function REACT(this: RCompiler, area: Area) {
            
            let range: Range, subArea: Area, bInit: boolean;
            // All constructs should create at least one new range
            //if (getRvars) {
                ({range, subArea, bInit} = PrepArea(srcElm, area, attName));
                area = subArea;
            //}

            if (bRenew)
                area = PrepArea(srcElm, area, 'renew', 2).subArea;

            await builder.call(this, area);

            if (getRvars) {
                let rvars = getRvars()
                    , subscriber: Subscriber, pVars: RVAR[]
                    , i = 0;
                if (bInit)
                    subscriber = this.Subscriber(subArea, updateBuilder, range.child, );
                else {
                    ({subscriber, rvars: pVars} = range.value);
                    assignEnv(subscriber.env, env);
                }
                range.value = {rvars, subscriber};
                for (let rvar of rvars) {
                    if (pVars) {
                        let pvar = pVars[i++];
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
            range.errorNode = u;
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
                    area.parent.insertBefore(createErrNode(message), area.range?.FirstOrNext);
                if (range)
                    range.errorNode = errNode;    /* */
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
                    let {range, bInit} = PrepArea(srcElm, area);
                    exp = bUpd || bInit ? range.result = (await prom)(env) : range.result
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
            if (lvName != null) { /* A regular iteration */
                let prevNm = atts.get('previous')
                    , nextNm = atts.get('next');
                if (prevNm == '') prevNm = 'previous';
                if (nextNm == '') nextNm = 'next';
                
                let getRange = this.CompAttrExpr<Iterable<Item> | Promise<Iterable<Item>>>(atts, 'of', true),
                getUpdatesTo = this.CompAttrExpr<RVAR>(atts, 'updates'),
                bReacting = atts.getB('reacting') || atts.getB('reactive') || !!getUpdatesTo,
            
                // Voeg de loop-variabele toe aan de context
                loopVar = this.NewVar(lvName),
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                ixVar = this.NewVar(ixName),
                prevVar = this.NewVar(prevNm),
                nextVar = this.NewVar(nextNm),

                getKey = this.CompAttrExpr<Key>(atts, 'key'),
                getHash = this.CompAttrExpr<Hash>(atts, 'hash'),

                // Compileer alle childNodes
                bodyBldr = await this.CompChildNodes(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, area: Area) {
                    let {range, subArea} = PrepArea(srcElm, area, ''),
                        {parent} = subArea,
                        before = subArea.before !== u ? subArea.before : range.Next,
                        iterable = getRange()
                    
                        , pIter = async (iter: Iterable<Item>) => {
                        let svEnv = SaveEnv();
                        try {

                            // Map of previous data, if any
                            let keyMap: Map<Key, Range> = range.value ||= new Map(),
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

                            let nextChild = range.child,
                                iterator = newMap.entries(),
                                nextIterator = nextNm ? newMap.values() : null

                                , prevItem: Item, nextItem: Item
                                , prevRange: Range = null,
                                childArea: Area;
                            subArea.parentR = range;
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
                                    subArea.range = null;
                                    subArea.prevR = prevRange;
                                    subArea.before = nextChild?.FirstOrNext || before;
                                    ({range: childRange, subArea: childArea} = PrepArea(null, subArea, `${lvName}(${idx})`));
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
                                    
                                    this.SetVar(loopVar, rvar || item);
                                    this.SetVar(ixVar, idx);
                                    this.SetVar(prevVar, prevItem);
                                    this.SetVar(nextVar, nextItem);

                                    // Body berekenen
                                    await bodyBldr.call(this, childArea);

                                    if (rvar)
                                        if (childRange.rvar)
                                            assignEnv(childRange.subs.env, env);
                                        else
                                            rvar.Subscribe(
                                                childRange.subs = this.Subscriber(childArea, bodyBldr, childRange.child)
                                            );
                                    childRange.rvar = rvar
                                }

                                prevItem = item;
                            }
                            if (prevRange) prevRange.next = null; else range.child = null;
                        }
                        finally { RestoreEnv(svEnv) }
                    }

                    if (iterable instanceof Promise) {
                        let subEnv = {env: CloneEnv(env), onerr,  onsucc},
                            rv = range.rvar = RVAR(null, iterable, null, 
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
                let nm = atts.get('of', true, true).toLowerCase()
                    , slot = this.CSignatures.get(nm);
                if (!slot)
                    throw `Missing attribute [let]`;

                let ixVar = this.NewVar(ixName)
                    , bodyBldr = await this.CompChildNodes(srcElm);
                //srcParent.removeChild(srcElm);

                return async function FOREACH_Slot(this: RCompiler, area: Area) {
                    let {subArea} = PrepArea(srcElm, area),
                        saved= SaveEnv(),
                        slotDef = env.constructs.get(nm);
                    ixVar();
                    try {
                        let idx = 0;
                        for (let slotBldr of slotDef.templates) {
                            this.SetVar(ixVar, idx++);
                            mapNm(env.constructs, {nm: nm, templates: [slotBldr], constructEnv: slotDef.constructEnv});
                            await bodyBldr.call(this, subArea);
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
            varNm     = rv || atts.get('let') || atts.get('var', true),
            getVal    = this.CompParam(atts, 'value') || dU,
            getStore    = rv && this.CompAttrExpr<Store>(atts, 'store'),
            bReact      = atts.getB('reacting') || atts.getB('updating'),
            lv          = this.NewVar(varNm);
        
        return [async function DEF(this: RCompiler, area) {
                let {range, bInit} = PrepArea(srcElm, area);
                if (bInit || bReact){
                    let v = getVal();
                    if (rv)
                        if (bInit)
                            range.value = new _RVAR(this.RC, null, v, getStore && getStore(), `RVAR_${rv}`);
                        else
                            range.value.SetAsync(v);
                    else
                        range.value = v;
                }
                lv(range.value);
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
                        : m[3] ? /^on/.test(m[2]) ? ()=>_=>null : dU   // Unspecified default
                        : null 
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
            styles: Node[] = [],
            {wspc} = this
            , signats: Array<Signature> = [], elmTemplate: HTMLTemplateElement;

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
                case 'TEMPLATE':
                    if (elmTemplate) throw 'Double <TEMPLATE>';
                    elmTemplate = child as HTMLTemplateElement;
                    break;
                case 'SIGNATURE':
                case 'SIGNATURES':
                    for (let elm of child.children)
                        signats.push(this.ParseSignat(elm));
                    break;
                default:
                    if (signats.length) throw `Illegal child element <${child.nodeName}>`;
                    signats.push(this.ParseSignat(child));
                    break;
            }
            if (bldr) builders.push([bldr, child]);
        }
        if (!signats.length) throw `Missing signature`;
        if (!elmTemplate) throw 'Missing <TEMPLATE>';

        for (let signat of signats)
            this.AddConstruct(signat);
               
        let nm = signats[0].nm,
        // Deze builder bouwt de component-instances op
            templates = [
                await this.CompTemplate(signats[0], elmTemplate.content, elmTemplate, 
                    false, bEncaps, styles)
            ];

        this.wspc = wspc;

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return async function COMPONENT(this: RCompiler, area: Area) {
            let constr: ConstructDef = {nm, templates};
            DefConstruct(constr);
            let saved = SaveEnv();
            try {
                for (let [bldr, srcNode] of builders)
                    await this.CallWithHandling(bldr, srcNode, area);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs

                constr.constructEnv = CloneEnv(env);     // Contains circular reference to construct
            }
            finally { RestoreEnv(saved) }
        };
    }

    private async CompTemplate(signat: Signature, contentNode: ParentNode, srcElm: HTMLElement, 
        bNewNames: boolean, bEncaps?: boolean, styles?: Node[], atts?: Atts
    ): Promise<Template>
    {
        let 
            saved = this.SaveCont(),
            myAtts = atts || new Atts(srcElm),
            lvars: Array<[string, LVar]> = [];
        try {
            for (let {mode,nm} of signat.Params)
                lvars.push([nm, this.NewVar(myAtts.get(mode + nm, bNewNames) || nm)]);

            for (let S of signat.Slots.values())
                this.AddConstruct(S);
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
                        DefConstruct({nm, templates, constructEnv: slotEnv});
                    
                    for (let [nm,lv] of lvars){
                        let arg = args[nm], dflt: Dependent<unknown>;
                        if (arg===u && (dflt = signat.Params[i]?.pDflt))
                            arg = dflt();
                        lv(arg);
                        i++;
                    }

                    if (bEncaps) {
                        let {range: elmRange, childArea, bInit} = PrepElm(srcElm, area, customName), 
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
            contentSlot = signat.Slots.get('content'),
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
                        , this.CompJScript<Handler>(
                            `ORx=>{${attVal}=ORx}`,
                            nm
                        )]
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
                && slotElm.localName != 'content'
            ) {
                slotBldrs.get(slotElm.localName).push(
                    await this.CompTemplate(Slot, slotElm, slotElm, true)
                );
                srcElm.removeChild(node);
            }
            
        if (contentSlot)
            slotBldrs.get('content').push(
                await this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts)
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
                {range, subArea, bInit} = PrepArea(srcElm, area);
            if (!cdef) return;
            bReadOnly = 1;
            let args = range.value ||= {};
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bInit)
                    args[nm] = RVAR('', dGet && dGet(), null, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            
            bReadOnly = 0;
            env = cdef.constructEnv;
            try {
                for (let {nm, pDflt} of signat.Params)
                    if (args[nm] === u)
                        args[nm] = pDflt();
                for (let template of cdef.templates) 
                    await template.call(this, subArea, args, slotBldrs, svEnv);
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
            let {range: {node}, childArea, bInit} = PrepElm(srcElm, area, nm);
            
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
                        setter = m[1]=='#' ? null : this.CompJScript<Handler>(
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
        this.AddedHdrElms.push(srcStyle);
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
            , isTriv = true, bThis = false
            , lastIndex = regIS.lastIndex = 0
            , dep: Dependent<string> & {fixed?: string}
            , m: RegExpExecArray;

        while (1)
            if (!(m = regIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
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
                    isTriv = false;
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
    private CompPattern(patt:string, url?: boolean): {lvars: LVar[], regex: RegExp, url: boolean}
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
                    ? (lvars.push(this.NewVar(m[1])), `(.*?)`)
                : m[0] == '?'   ? '.'
                : m[0] == '*'   ? '.*'
                : m[2]          ? m[2] // An escaped character
                                : m[0] // A character class or "\{"
        }

        return {lvars, regex: new RegExp(`^${reg}$`, 'i'), url}; 
    }

    private CompParam(atts: Atts, attName: string, bReq?: boolean): Dependent<unknown> {
        let v = atts.get(attName);
        return (
            v == null ? this.CompAttrExpr(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandler(attName, v)
            : this.CompString(v, attName)
        );
    }
    private CompAttrExpr<T>(atts: Atts, attName: string, bReq?: boolean) {
        return this.CompJScript<T>(atts.get(attName, bReq, true),attName);
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
        if (expr == null) return null;

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
    private compAttrExprList<T>(atts: Atts, attName: string, bReacts?: boolean): Dependent<T[]> {
        let list = atts.get(attName, false, true);
        if (!list) return null;
        if (bReacts)
            for (let nm of list.split(','))
                this.cRvars.set(nm.trim(), false);
        return list ? this.CompJScript<T[]>(`[${list}\n]`, attName) : null;
    }

    private AddErrH(getHndlr: Dependent<Handler>): Dependent<Handler> {
        return () => {
            let hndlr = getHndlr(), sErr = onerr, sSuc = onsucc;
            if (hndlr && (sErr||sSuc))
                return function hError(this: HTMLElement, ev: Event) {
                    try {
                        let r = hndlr.call(this,ev);
                        if (r instanceof Promise)
                            return r.then(sSuc, sErr);
                        if (sSuc) sSuc(null);
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
        name?: string, 
        initialValue?: T | Promise<T>, 
        private store?: Store,
        private storeName: string = `RVAR_${name}`,
    ) {
        if (name) globalThis[name] = this;
        
        let s = store && store.getItem(storeName);
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
            this.V = u;
            t.then(v => {this.V = v}, onerr);
        } else
            this.V = t;
    }
    get Set() {
        return this.SetAsync.bind(this);
    }
    get Clear() {
        return () => {this.V=u};
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
        let b: Subscriber;
        for (let sub of this._Subscribers)
            if (sub.bImm)
                sub(this._Value);
            else if (!sub.sArea?.range?.erased)
                this.RC.AddDirty(b = sub);
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
        for (let att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }

    public get(nm: string, bRequired?: boolean, bHashAllowed?: boolean) {
        let n = nm, value = super.get(n);
        if (value==null && bHashAllowed) {
            n = '#' + nm;
            value = super.get(n);
        }
        if (value != null)
            super.delete(n);
        else if (bRequired)
            throw `Missing attribute [${nm}]`;
        return value;
    }
    public getB(nm: string): boolean { 
        let m = /^((no|false)|yes|true)?$/i.exec(this.get(nm));
        return m && !m[2];
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
    if (!regIdent.test(nm = nm.trim()) )
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

function OuterOpenTag(elm: HTMLElement, maxLength?: number): string {
    return Abbrev(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLength-1) + '>';
}
function Abbrev(s: string, maxLength: number) {
    return (maxLength && s.length > maxLength
        ? s.substring(0, maxLength - 3) + "..."
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
let _range = globalThis.range = function* range(from: number, upto?: number, step: number = 1) {
	if (upto === u) {
		upto = from;
		from = 0;
	}
	for (let i= from; i<upto; i += step)
		yield i;
}
globalThis.RCompile = RCompile;
globalThis.RBuild = RBuild;
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

export {_range as range};
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
}, true);

window.addEventListener('popstate', () => {docLocation.V = location.href;} );

function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substring(1))?.scrollIntoView()), 6);
}