// Global settings
const defaultSettings = {
    bAbortOnError:  false,  // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    true,   // Show runtime errors as text in the DOM output
    bStripSpaces:   true,   // To do
    bRunScripts:    false,
    bBuild:         true,
    rootPattern:    null as string,
}


// A DOMBUILDER is the semantics of a piece of RHTML.
// It can both build (construct) a new piece of DOM, and update an existing piece of DOM.
type DOMBuilder = ((reg: Area) => Promise<void>) & {bTrim?: boolean};

// An AREA is the (runtime) place to build or update, with all required information
type Area = {
    range?: Range,              // Existing piece of DOM
    parent: Node;               // DOM parent node
    env: Environment;
    before?: ChildNode

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
    /* Either: */
    //    node: NodeType;
    /* Or: */
        child: Range;       // Linked list of children (null=empty)
    /* Or neither */
    
    next: Range = null;        // Next item in linked list

    endMark?: Comment;

    constructor(
        public node?: NodeType,
        public text?: string
    ) {
        if (!node) this.child = null;
    }
    toString() { return this.text || this.node?.nodeName; }

    result?: any;
    value?: any;
    errorNode?: ChildNode;

    // Alleen voor FOR-iteraties
    hash?: Hash; key?: Key; prev?: Range;
    fragm?: DocumentFragment;

    public get First(): ChildNode {
        let f: ChildNode
        if (f = this.node) return f;
        let child = this.child;
        while (child) {
            if (f = child.First) return f;
            child = child.next;
        }
        return this.endMark || null;
    }

    Nodes(): Generator<ChildNode> { 
        return (function* Nodes(r: Range) {
            if (r.node)
                yield r.node;
            else {
                let child = r.child;
                while (child) {
                    yield* Nodes(child as Range);
                    child = child.next;
                }
            }
            if (r.endMark)
                yield r.endMark;
        })(this)
    }
    
    public get isConnected(): boolean {
        const f = this.First;
        return f && f.isConnected;
    }
}

// A CONTEXT is the set of local variable names, each with a number indicating its position in an environment
type Context = Map<string, number>;

// An ENVIRONMENT for a given context is the array of concrete values for all names in that context,
// together with concrete definitions for all visible constructs
type Environment = 
    Array<unknown> 
    & { constructDefs: Map<string, ConstructDef> };

// A  DEPENDENT value of type T in a given context is a routine computing a T using an environment for that context.
// It may carry an indicator that the routine might need a value for 'this'.
// This will be the semantics, the meaning, of e.g. a JavaScript expression.
type Dependent<T> = ((env: Environment) => T) & {bThis?: boolean};


function PrepareArea(srcElm: HTMLElement, area: Area, text: string = '',
    bMark?: boolean|1|2,  // true=mark area, no wiping; 1=wipe when result has changed; 2=wipe always
    result?: any,
) : {range: Range, subArea:Area, bInit: boolean}
{
    let {parent, env, range, before} = area,
        subArea: Area = {parent, env, range: null, }
        , bInit = !range;
    if (bInit) {
        if (srcElm) text = `${srcElm.localName}${text?' ':''}${text}`;
        
        UpdatePrevArea(area, range = subArea.parentR = new Range(null, text));
        range.result = result;

        if (bMark)
            before = range.endMark = parent.insertBefore<Comment>(
                document.createComment('/'+text), before);
    }
    else {
        subArea.range = range.child;
        area.range = range.next;

        if (bMark) {
            before = range.endMark;
            if (bMark==1 && result != range.result || bMark==2) {
                range.result = result;
                let node = range.First || before;
                while (node != before) {
                    const next = node.nextSibling;
                    parent.removeChild(node);
                    node = next;
                }
                range.child = null;
                subArea.range = null;
                subArea.parentR = range;
                bInit = true;
            }
        }
    }
    
    subArea.before = before;    
    return {range, subArea, bInit};
}
function UpdatePrevArea(area: Area, range: Range) {
    let r: Range
    if (r = area.parentR) {
        r.child = range;
        area.parentR = null;
    }
    else if (r = area.prevR) 
        r.next = range;

    area.prevR = range;
}

function PrepareElement<T>(srcElm: HTMLElement, area: Area, nodeName = srcElm.nodeName): 
    {elmRange: Range<HTMLElement> & T, childArea: Area, bInit: boolean} {
    let elmRange = area.range as Range<HTMLElement> & T, bInit = !elmRange;
    if (bInit) {
        const elm: HTMLElement =
            ( area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore<HTMLElement>(document.createElement(nodeName), area.before)
            );
        elmRange = new Range<HTMLElement>(elm) as Range<HTMLElement> & T;
        UpdatePrevArea(area, elmRange);
    }
    else {
        area.range = elmRange.next
    }
    return {elmRange, 
        childArea: {parent: elmRange.node, range: elmRange.child, before: null, env: area.env, 
        parentR: elmRange},
        bInit};
}

function PrepareText(area: Area, content: string) {
    let range = area.range as Range<Text>;
    if (!range) {
        range = new Range(
            area.parent.insertBefore<Text>(document.createTextNode(content), area.before), 'text'
            );
        UpdatePrevArea(area, range);
    } else {
        range.node.data = content;
        area.range = range.next;
    }
}


type FullSettings = typeof defaultSettings;
type Settings = Partial<FullSettings>;
const location = document.location;
let RootPath: string = null;

export function RCompile(elm: HTMLElement, settings?: Settings): Promise<void> {    
    try {
        let {rootPattern} = settings = {...defaultSettings, ...settings},
            url = `${location.origin}${location.pathname}`;
        if (rootPattern) {
            const m = url.match(`^.*(${rootPattern})`);
            if (!m)
                throw `Root pattern '${rootPattern}' does not match URL '${url}'`;
            url = m[0]; // (new URL(m[0])).pathname;
        }
        RootPath = (new URL(url)).pathname.replace(/[^/]*$/, '');
        globalThis.RootPath = RootPath;
        SetLocation();

        const R = RHTML;
        R.FilePath = location.origin + RootPath
        R.Compile(elm, settings, true);
        R.ToBuild.push({parent: elm.parentElement, env: NewEnv(), source: elm, range: null});

        return (R.Settings.bBuild
            ? R.DoUpdate().then(() => {elm.hidden = false} )
            : null);
    }
    catch (err) {
        window.alert(`Re-Act error: ${err}`);
    }
}

type SavedContext = number;
function NewEnv(): Environment { 
    const env = [] as Environment;
    env.constructDefs = new Map();
    return env;
}
function CloneEnv(env: Environment): Environment {
    const clone = env.slice() as Environment;
    clone.constructDefs = new Map(env.constructDefs.entries());
    return clone;
}


class Subscriber {
    parent: Node;
    before: ChildNode;
    env: Environment;
    bNoChildBuilding: boolean;
    constructor(
        area: Area,
        public builder: DOMBuilder, 
        public range: Range,
    ) {
        this.parent = area.parent;
        this.before = area.before;
        this.bNoChildBuilding = area.bNoChildBuilding;
        this.env = area.env && CloneEnv(area.env);
    }
}

type ParentNode = HTMLElement|DocumentFragment;


type Handler = (ev:Event) => any;
type LVar = ((env: Environment) => (value: unknown) => void) & {varName: string};

// A SIGNATURE describes an RHTML user construct (a component or a slot)
class Signature {
    constructor(public srcElm: Element){ 
        this.name = srcElm.localName;
    }
    public name: string;
    public Parameters: Array<Parameter> = [];
    public RestParam: Parameter = null;
    public Slots = new Map<string, Signature>();

    IsCompatible(sig: Signature): boolean {
        let result =
            sig
            && this.name == sig.name
            && this.Parameters.length <= sig.Parameters.length;
        
        const iter = sig.Parameters.values();
        for (const thisParam of this.Parameters) {
            const sigParam = iter.next().value as Parameter;
            result &&= thisParam.name == sigParam.name && (!thisParam.pDefault || !!sigParam.pDefault);
        }
                
        result &&= !this.RestParam || this.RestParam.name == sig.RestParam?.name;

        for (let [slotname, slotSig] of this.Slots)
            result &&= slotSig.IsCompatible(sig.Slots.get(slotname));
        
        return result;
    }
}
// A PARAMETER describes a construct parameter: a name with a default expression
type Parameter = {name: string, pDefault: Dependent<unknown>};

// A CONSTRUCTDEF is a concrete instance of a signature
type ConstructDef = {instanceBuilders: ParametrizedBuilder[], constructEnv: Environment};
type ParametrizedBuilder = 
    (this: RCompiler, area: Area, args: unknown[], mapSlotBuilders: Map<string, ParametrizedBuilder[]>, slotEnv: Environment)
    => Promise<void>;

export type RVAR_Light<T> = T & {
    _Subscribers?: Array<Subscriber>;
    _UpdatesTo?: Array<_RVAR>;
    Subscribe?: (sub:Subscriber) => void;
    readonly U?: T;
};

const globalEval = eval, globalFetch = fetch;

interface Item {}  // Three unknown but distinct types, used by the <FOR> construct
interface Key {}
interface Hash {}

enum ModifType {Attr, Prop, Class, Style, Event, AddToStyle, AddToClassList, RestArgument,
    oncreate, onupdate
}
type Modifier = {
    modType: ModifType,
    name: string,
    depValue: Dependent<unknown>,
}
type RestParameter = Array<{modType: ModifType, name: string, value: unknown}>;
let bReadOnly: boolean = false;

function ApplyModifier(elm: HTMLElement, modType: ModifType, name: string, val: unknown, bCreate: boolean) {    
    switch (modType) {
        case ModifType.Attr:
            elm.setAttribute(name, val as string || ''); 
            break;
        case ModifType.Prop:
            if (val != null)
                elm[name] = val;
            else
                delete elm[name];
            break;
        case ModifType.Event:
            if (val) elm[name] = val; break;
        case ModifType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModifType.Style:
            if (val !== undefined)
                elm.style[name] = val || '';
            break;
        case ModifType.AddToStyle:
            if (val) Object.assign(elm.style, val); break
        case ModifType.AddToClassList:
            if (Array.isArray(val))
                for (const className of val as string[])
                    elm.classList.add(className);
            else
                for (const [className, bln] of Object.entries<boolean>(val as {}))
                    if (bln)
                        elm.classList.add(className);
            break;
        case ModifType.RestArgument:
            for (const {modType, name, value} of val as RestParameter)
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case ModifType.oncreate:
            if (bCreate)
                (val as ()=>void).call(elm); 
            break;
        case ModifType.onupdate:
            (val as ()=>void).call(elm); 
            break;
    }
}
function ApplyModifiers(elm: HTMLElement, modifiers: Modifier[], {env, range}: Area) {
    // Apply all modifiers: adding attributes, classes, styles, events
    for (const {modType, name, depValue} of modifiers) {
        try {
            bReadOnly= true;
            const value = depValue.bThis ? depValue.call(elm, env) : depValue(env);    // Evaluate the dependent value in the current environment
            bReadOnly = false;
            // See what to do with it
            ApplyModifier(elm, modType, name, value, !range)
        }
        catch (err) { throw `[${name}]: ${err}` }
    }
}

type Module = {Signatures: Map<string, Signature>, ConstructDefs: Map<string, ConstructDef>};
const Modules = new Map<string, Promise<Module>>();

const envActions: Array<() => void> = [];
type SavedEnv = number;
function SaveEnv(): SavedEnv {
    return envActions.length;
}
function RestoreEnv(savedEnv: SavedEnv) {
    for (let j=envActions.length; j>savedEnv; j--)
        envActions.pop()();
}
class RCompiler {

    static iNum=0;
    public instanceNum = RCompiler.iNum++;

    private ContextMap: Context;
    private context: string; 

    private Constructs: Map<string, Signature>;
    private StyleRoot: Node;
    private StyleBefore: ChildNode;
    private AddedHeaderElements: Array<HTMLElement>;
    public FilePath: string;

    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(
        private clone?: RCompiler,
    ) { 
        this.context    = clone?.context || "";
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings   = clone ? {...clone.Settings} : {...defaultSettings};
        this.AddedHeaderElements = clone?.AddedHeaderElements || [];
        this.StyleRoot  = clone?.StyleRoot || document.head;
        this.StyleBefore = clone?.StyleBefore
        this.FilePath   = clone?.FilePath || location.origin + RootPath;
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

            let i = this.ContextMap.get(name);
            const bNewName = i == null;
            if (bNewName){
                const savedContext = this.context;
                i = this.ContextMap.size;
                this.ContextMap.set(name, i);
                this.context += `${name},`
                this.restoreActions.push(
                    () => { this.ContextMap.delete( name );
                        this.context = savedContext;
                    }
                );
            }
            init = function InitVar(env: Environment) {
                const prev = env[i], j=i;
                envActions.push( () => {env[j] = prev } );
                
                return (value: unknown) => {env[j] = value };
            }.bind(this) as LVar;
        }
        init.varName = name;
        return init;        
    }

    private AddConstruct(C: Signature) {
        const CName = C.name;
        const savedConstr = this.Constructs.get(CName);
        this.Constructs.set(CName, C);
        this.restoreActions.push(
            () => this.Constructs.set(CName, savedConstr)
        );
    }

    // Compile a source tree into an ElmBuilder
    public Compile(
        elm: ParentNode, 
        settings: Settings = {},
        bIncludeSelf: boolean = false,  // Compile the element itself, or just its childnodes
    ) {
        Object.assign(this.Settings, settings);
        const t0 = performance.now();
        const savedR = RHTML; 
        try {
            if (!this.clone) RHTML = this;
            if (bIncludeSelf)
                this.Builder = this.CompElement(elm.parentElement, elm as HTMLElement)[0];
            else
                this.Builder = this.CompChildNodes(elm);
            this.bCompiled = true;
        }
        finally {
            RHTML = savedR;
        }
        const t1 = performance.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${(t1 - t0).toFixed(1)} ms`);
    }

    public async InitialBuild(area: Area) {
        const savedRCompiler = RHTML, {parentR} = area;
        RHTML = this;
        await this.Builder(area);

        this.AllAreas.push(new Subscriber(area, this.Builder, parentR ? parentR.child : area.prevR));
        RHTML = savedRCompiler;
    }

    public Settings: FullSettings;
    public ToBuild: Area[] = [];
    private AllAreas: Subscriber[] = [];
    private Builder: DOMBuilder;
    private bTrimLeft: boolean = false;
    private bTrimRight: boolean = false;

    private bCompiled = false;
    private bHasReacts = false;

    public DirtyVars = new Set<_RVAR>();
    private DirtySubs = new Map<Range, Subscriber>();
    public AddDirty(sub: Subscriber) {
        this.MainC.DirtySubs.set(sub.range, sub)
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
            }, 0);
    };

    private buildStart: number;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating) { window.alert('Updating X!')
            return;}
        
        for (let i=0;i<2;i++) {
            this.bUpdate = false;
            this.bUpdating = true;
            let savedRCompiler = RHTML;
            try {
                if (this.ToBuild.length) {
                    this.buildStart = performance.now();
                    this.builtNodeCount = 0;
                    for (const area of this.ToBuild)
                        await this.InitialBuild(area);
                    console.log(`Built ${this.builtNodeCount} nodes in ${(performance.now() - this.buildStart).toFixed(1)} ms`);
                    this.ToBuild = [];
                }
                else {
                    if (!this.MainC.bHasReacts)
                        for (const s of this.AllAreas)
                            this.AddDirty(s);

                    for (const rvar of this.DirtyVars)
                        rvar.Save();
                    this.DirtyVars.clear();
                    
                    if (this.DirtySubs.size) {
                        if (!this.clone) RHTML = this;
                        this.buildStart = performance.now();
                        this.builtNodeCount = 0;
                        const subs = this.DirtySubs;
                        this.DirtySubs = new Map();
                        for (const {range, builder, parent, before, env, bNoChildBuilding} of subs.values()) {
                            try { 
                                await builder.call(this, {range, parent, before, env, bNoChildBuilding}); 
                            }
                            catch (err) {
                                const msg = `ERROR: ${err}`;
                                console.log(msg);
                                window.alert(msg);
                            }
                        }
                        console.log(`Updated ${this.builtNodeCount} nodes in ${(performance.now() - this.buildStart).toFixed(1)} ms`);
                    }
                }
            }
            finally { 
                RHTML = savedRCompiler;this.bUpdating = false;
            }
            if (!this.bUpdate) break;
        } 
    }

    /* A "responsive variable" is a variable which listeners can subscribe to. */
    RVAR<T>(
        name?: string, 
        initialValue?: T, 
        store?: Store
    ) {
        return new _RVAR<T>(this.MainC, name, initialValue, store, name);
    }; // as <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>;
    
    private RVAR_Light<T>(
        t: RVAR_Light<T>, 
        //: Array<Subscriber> = [],
        updatesTo: Array<_RVAR> = [],
    ): RVAR_Light<T> {
        if (!t._Subscribers) {
            t._Subscribers = []; //subscribers;
            t._UpdatesTo = updatesTo;
            const R: RCompiler = this.MainC;
            Object.defineProperty(t, 'U',
                {get:
                    function() {
                        for (const sub of t._Subscribers)
                            R.AddDirty(sub);
                        if (t._UpdatesTo.length)
                            for (const rvar of t._UpdatesTo)
                                rvar.SetDirty();
                        else
                            R.RUpdate();
                        return t;
                    }
                }
            );
            t.Subscribe = function(sub: Subscriber) { t._Subscribers.push(sub) } ;
        }
        return t;
    }

    private sourceNodeCount = 0;   // To check for empty Content
    public builtNodeCount = 0;

    private CompChildNodes(
        srcParent: ParentNode,
        bBlockLevel?: boolean,
        childNodes: ChildNode[] = Array.from( srcParent.childNodes ),
        bNorestore?: boolean
    ): DOMBuilder {
        const builders = [] as Array< [DOMBuilder, ChildNode, boolean?] >;
        const saved = this.SaveContext();
        this.sourceNodeCount += childNodes.length;
        try {
            for (const srcNode of childNodes) {
                ///srcParent.removeChild(srcNode);
                switch (srcNode.nodeType) {
                    
                    case Node.ELEMENT_NODE:
                        const builderElm = this.CompElement(srcParent, srcNode as HTMLElement, bBlockLevel);
                        if (builderElm) {
                            builders.push(builderElm);
                        
                            if (builderElm[0].bTrim) {
                                let i = builders.length - 2;
                                while (i>=0 && builders[i][2]) {
                                    srcParent.removeChild(builders[i][1]);
                                    builders.splice(i, 1);
                                    i--;
                                }
                            }
                        }
                        break;

                    case Node.TEXT_NODE:
                        let str = srcNode.nodeValue;
                        if (this.bTrimLeft && /^[ \t\r\n]*$/.test(str))
                            str = "";
                        else str = str.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ' ');

                        if (str != '') {
                            this.bTrimLeft = /[ \t\r\n]$/.test(str);
                            const getText = this.CompInterpolatedString( str );
                            async function Text(area: Area) {
                                PrepareText(area, getText(area.env))
                            }

                            builders.push( [ Text, srcNode, getText.isBlank] );
                        }
                        //else
                        //    srcParent.removeChild(srcNode);
                        break;
/*
                    default:    // Other nodes (especially comments) are removed
                        srcParent.removeChild(srcNode);
                        continue;
*/
                }
            }
        }
        finally {
            if (!bNorestore) this.RestoreContext(saved);
        }
        return builders.length == 0 ? async ()=>{} :
             async function ChildNodes(this: RCompiler, area) {
                const savedEnv = SaveEnv();
                try {
                    for (const [builder, node] of builders)
                        await this.CallWithErrorHandling(builder, node, area);
                    this.builtNodeCount += builders.length;
                }
                finally {
                    if (!bNorestore) RestoreEnv(savedEnv);
                }
            };
    }

    static preMods = ['reacton','reactson','thisreactson'];
    private CompElement(srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel?: boolean): [DOMBuilder, ChildNode] {
        const atts =  new Atts(srcElm);
        let builder: DOMBuilder = null;
        const mapReacts: Array<{attName: string, rvars: Dependent<_RVAR>[]}> = [];
        for (const attName of RCompiler.preMods) {
            const val = atts.get(attName);
            if (val) mapReacts.push({attName, rvars: val.split(',').map( expr => this.CompJavaScript<_RVAR>(expr) )});
        }
labelNoCheck:
        try {
            // See if this node is a user-defined construct (component or slot) instance
            const construct = this.Constructs.get(srcElm.localName);
            if (construct)
                builder = this.CompInstance(srcParent, srcElm, atts, construct);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define': { // 'LET' staat de parser niet toe.
                        //srcParent.removeChild(srcElm);
                        const rvarName = atts.get('rvar');
                        const varName = rvarName || atts.get('name') || atts.get('var', true);
                        const getValue = this.CompParameter(atts, 'value');
                        const getStore = rvarName && this.CompAttrExpr<Store>(atts, 'store');
                        const newVar = this.NewVar(varName);
                        const bReact = atts.get('reacting') ?? atts.get('updating') != null;
                        const subBuilder = this.CompChildNodes(srcElm);

                        builder = async function DEFINE(this: RCompiler, area) {
                                const {range, subArea, bInit} = PrepareArea(srcElm, area);
                                let rvar: _RVAR;
                                if (bInit || bReact){
                                    const value = getValue && getValue(area.env);
                                    range.value = rvarName 
                                        ? rvar = new _RVAR(this.MainC, null, value, getStore && getStore(area.env), rvarName) 
                                        : value;
                                }
                                newVar(area.env)(range.value);
                                await subBuilder.call(this, subArea);
                                /*
                                if (bInit && rvar) {
                                //    (range.value as _RVAR).Subscribe(new Subscriber(subArea, subBuilder, range.child));
                                    const a = area;
                                    envActions.push(() => {
                                        if (rvar.Subscribers.size == 0)
                                        rvar.Subscribe(new Subscriber(
                                            a, null, range.next
                                        ))
                                    })
                                }
                                */
                            };
                    } break;

                    case 'if':
                    case 'case': {
                        const bHiding = CBool(atts.get('hiding'));
                        const caseList: Array<{
                            condition: Dependent<unknown>,
                            patt: {lvars: LVar[], regex: RegExp, url?: boolean},
                            builder: DOMBuilder, 
                            childElm: HTMLElement,
                        }> = [];
                        const getCondition = (srcElm.nodeName == 'IF') && this.CompAttrExpr<boolean>(atts, 'cond', true);
                        const getValue = this.CompAttrExpr<string>(atts, 'value');
                        atts.CheckNoAttsLeft();
                        const bodyNodes: ChildNode[] = [];
                        const bTrimLeft = this.bTrimLeft;
                        for (const child of srcElm.childNodes) {
                            if (child.nodeType == Node.ELEMENT_NODE) {
                                const childElm = child as HTMLElement;
                                const atts = new Atts(childElm);
                                this.bTrimLeft = bTrimLeft;
                                const saved = this.SaveContext();
                                try {
                                    let condition: Dependent<unknown>;
                                    let patt:  {lvars: LVar[], regex: RegExp, url?: boolean};
                                    switch (child.nodeName) {
                                        case 'WHEN':                                
                                            condition = this.CompAttrExpr<unknown>(atts, 'cond');
                                            let pattern: string;
                                            if ((pattern = atts.get('match')) != null)
                                                patt = this.CompPattern(pattern);
                                            else if ((pattern = atts.get('urlmatch')) != null)
                                                (patt = this.CompPattern(pattern)).url = true;
                                            else if ((pattern = atts.get('regmatch')) != null) {
                                                const lvars = atts.get('captures')?.split(',') || []
                                                patt = {regex: new RegExp(pattern, 'i'), lvars: lvars.map(this.NewVar.bind(this))};
                                            }
                                            else 
                                                patt = null;

                                            if (bHiding && patt?.lvars.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !getValue)
                                                throw `Match requested but no 'value' specified.`;

                                        // Fall through!
                                        case 'ELSE':
                                            const builder = this.CompChildNodes(childElm, bBlockLevel);
                                            caseList.push({condition, patt, builder, childElm});
                                            atts.CheckNoAttsLeft();
                                            continue;
                                    }
                                } 
                                catch (err) { throw OuterOpenTag(childElm)+ err  }
                                finally { this.RestoreContext(saved) }
                            }
                            bodyNodes.push(child);
                        }
                        if (getCondition)
                            caseList.unshift({
                                condition: getCondition, patt: null,
                                builder: this.CompChildNodes(srcElm, bBlockLevel, bodyNodes),
                                childElm: srcElm
                            });

                        builder = 
                            async function CASE(this: RCompiler, area: Area) {
                                const {env} = area,
                                    value = getValue && getValue(env);
                                let choosenAlt: typeof caseList[0] = null;
                                let matchResult: RegExpExecArray;
                                for (const alt of caseList)
                                    try {
                                        if (
                                            (!alt.condition || alt.condition(env)) 
                                            && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))
                                            )
                                        { choosenAlt = alt; break }
                                    } catch (err) { throw OuterOpenTag(alt.childElm) + err }
                                if (bHiding) {
                                    // In this CASE variant, all subtrees are kept in place, some are hidden
                                    /*
                                    if (bInit && area.source == srcElm) {
                                        subArea.range.first = srcElm.child;
                                        srcElm.replaceWith(...srcElm.childNodes);
                                    }
                                    */
                                        
                                    for (const alt of caseList) {
                                        const {elmRange, childArea, bInit} = PrepareElement(alt.childElm, area);
                                        const bHidden = elmRange.node.hidden = alt != choosenAlt;
                                        if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                            await this.CallWithErrorHandling(alt.builder, alt.childElm, 
                                                childArea );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    const {subArea, bInit} = PrepareArea(srcElm, area, '', 1, choosenAlt);
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
                                            await this.CallWithErrorHandling(choosenAlt.builder, choosenAlt.childElm, subArea );
                                        } finally { RestoreEnv(saved) }
                                    }
                                }
                        }
                        this.bTrimLeft = false;
                    } break;
                            
                    case 'for':
                    case 'foreach':
                        builder = this.CompFor(srcParent, srcElm, atts, bBlockLevel);
                    break;
                        
                    case 'include': {
                        const src = atts.get('src', true);
                        // Placeholder that will contain a Template when the file has been received
                        let C: RCompiler = new RCompiler(this);
                        C.FilePath = GetPath(src, this.FilePath);
                        
                        const task = (async () => {
                            const textContent = await FetchText(src);
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
                                this.buildStart += performance.now() - t0;
                                await C.Builder(area);
                                this.builtNodeCount += C.builtNodeCount;
                            };
                    } break;

                    case 'import': {
                        const src = atts.get('src', true);
                        const listImports = new Array<[Signature, ConstructDef]>();
                        const dummyEnv = NewEnv();
                        
                        for (const child of srcElm.children) {
                            const signature = this.ParseSignature(child);
                            async function holdOn(this: RCompiler, area, args, mapSlotBuilders, slotEnv) {
                                const t0 = performance.now();
                                await task;
                                this.buildStart += performance.now() - t0;
                                area.env = placeholder.constructEnv;
                                for (const builder of placeholder.instanceBuilders)
                                    await builder.call(this, area, args, mapSlotBuilders, slotEnv);
                            }
                            const placeholder: ConstructDef = {instanceBuilders: [holdOn], constructEnv: dummyEnv} ;

                            listImports.push([signature, placeholder]);
                            
                            this.AddConstruct(signature);
                        }
                        const C = new RCompiler();
                        C.FilePath = GetPath(src, this.FilePath);
                        C.Settings.bRunScripts = true;
                        
                        const task =
                            (async () => {
                                let promiseModule = Modules.get(src);
                                if (!promiseModule) {
                                    promiseModule = FetchText(src)
                                    .then(async textContent => {
                                        // Parse the contents of the file
                                        const parser = new DOMParser(),
                                            parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument,
                                            builder = C.CompChildNodes(parsedContent.body, true, undefined, true),
                                            env = NewEnv();

                                        await builder.call(this, {parent: parsedContent.body, start: null, bInit: true, env});
                                        return {Signatures: C.Constructs, ConstructDefs: env.constructDefs};
                                    });
                                    Modules.set(src, promiseModule);
                                }
                                const module = await promiseModule;
                                
                                for (const [clientSig, placeholder] of listImports) {
                                    const {name} = clientSig,
                                        signature = module.Signatures.get(name);
                                    if (!signature)
                                        throw `<${name}> is missing in '${src}'`;
                                    if (!clientSig.IsCompatible(signature))
                                        throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signature.srcElm.outerHTML}`;
                                    
                                    const constructdef = module.ConstructDefs.get(name);
                                    placeholder.instanceBuilders = constructdef.instanceBuilders;
                                    placeholder.constructEnv = constructdef.constructEnv;
                                }
                            })();
                        
                        //srcParent.removeChild(srcElm);

                        builder = async function IMPORT({env}: Area) {
                            for (const [{name}, constructDef] of listImports.values()) {
                                const prevDef = env.constructDefs.get(name);
                                env.constructDefs.set(name, constructDef);
                                envActions.push(
                                    () => { env.constructDefs.set(name,  prevDef); }
                                );
                            }
                        }

                    } break

                    case 'react': {
                        this.MainC.bHasReacts = true;
                        const reacts = atts.get('on', false, true);
                        const getRvars = reacts ? reacts.split(',').map( expr => this.CompJavaScript<_RVAR>(expr) ) : [];
                        const getHash = this.CompAttrExpr(atts, 'hash');

                        const bodyBuilder = this.CompChildNodes(srcElm, bBlockLevel);
                        
                        builder = this.GetREACT(srcElm, '', bodyBuilder, getRvars);

                        if (getHash) {
                            const b = builder;
                            builder = async function HASH(this: RCompiler, area: Area) {
                                const hash = getHash(area.env);
                                const {subArea, range} = PrepareArea(srcElm, area, 'hash');
                                if (hash !== range.value) {
                                    range.value = hash;
                                    await b.call(this, subArea);
                                }
                            }
                        }
                    } break;

                    case 'rhtml': {
                        const bodyBuilder = this.CompChildNodes(srcElm, bBlockLevel);
                        //srcParent.removeChild(srcElm);
                        //const bEncapsulate = CBool(atts.get('encapsulate'));

                        const imports = this.CompAttrExpr(atts, 'imports');
                        const {preModifiers} = this.CompAttributes(atts);

                        builder = async function RHTML(this: RCompiler, area) {
                            const tempElm = document.createElement('rhtml');
                            await bodyBuilder.call(this, {parent: tempElm, env: area.env, range: null});
                            const result = tempElm.innerText
                            
                            const {elmRange} = PrepareElement<{hdrElms: ChildNode[]}>(srcElm, area, 'rhtml-rhtml'), 
                                elm = elmRange.node;
                            ApplyModifiers(elm, preModifiers, area);

                            if (area.prevR || result != elmRange.result) {
                                elmRange.result = result;
                                const shadowRoot = elm.shadowRoot || elm.attachShadow({mode: 'open'});

                                try {
                                    tempElm.innerHTML = result;
                                    if (elmRange.hdrElms) {
                                        for (const elm of elmRange.hdrElms) elm.remove();
                                        elmRange.hdrElms = null;
                                    }
                                    const R = new RCompiler();;
                                    (R.StyleRoot = shadowRoot).innerHTML = '';
                                    R.Compile(tempElm, {bRunScripts: true }, false);
                                    elmRange.hdrElms = R.AddedHeaderElements;
                                    
                                    const subArea: Area = 
                                        {parent: shadowRoot, range: null, env: NewEnv(), parentR: new Range(null, 'Shadow')};
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
                        builder = this.CompScript(srcParent, srcElm as HTMLScriptElement, atts); break;

                    case 'style':
                        builder = this.CompStyle(srcElm); break;

                    case 'component': 
                        builder = this.CompComponent(srcParent, srcElm, atts); break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        builder = this.CompHTMLElement(srcElm, atts); 
                        break labelNoCheck;
                }
                atts.CheckNoAttsLeft();
            }
        }
        catch (err) { 
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }

        for (const {attName, rvars} of mapReacts)
            builder = this.GetREACT(srcElm, attName, builder, rvars);
        
        if (builder)
            return [builder, srcElm];
        return null;
    }

    private GetREACT(srcElm: HTMLElement, attName: string, builder: DOMBuilder, rvars: Array<Dependent<_RVAR>>): DOMBuilder{
        this.MainC.bHasReacts = true;
        const  updateBuilder = 
            ( attName == 'thisreactson'
            ? async function reacton(this: RCompiler, area: Area) {
                area.bNoChildBuilding = true;
                await builder.call(this, area);
            }
            : builder
            );

        return async function REACT(this: RCompiler, area) {
            const {range, subArea, bInit} = PrepareArea(srcElm, area, attName, true);
            
            await builder.call(this, subArea);

            if (bInit) {
                const subscriber = new Subscriber(subArea, updateBuilder, range.child, );
        
                // Subscribe bij de gegeven variabelen
                for (const getRvar of rvars) {
                    const rvar = getRvar(area.env);
                    rvar.Subscribe(subscriber);
                }
            }
        }
    }

    private async CallWithErrorHandling(this: RCompiler, builder: DOMBuilder, srcNode: ChildNode, area: Area){
        let {range} = area;
        if (range && range.errorNode) {
            area.parent.removeChild(range.errorNode);
            range.errorNode = undefined;
        }
        try {
            //await builder(area);
            await builder.call(this, area);
        } 
        catch (err) { 
            const message = 
                srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode =
                    area.parent.insertBefore(createErrorNode(message), area.range?.First);
                if (range)
                    range.errorNode = errorNode;    /* */
            }
        }
    }

    private CompScript(this:RCompiler, srcParent: ParentNode, srcElm: HTMLScriptElement, atts: Atts) {
        //srcParent.removeChild(srcElm);
        const bModule = atts.get('type') == 'module';
        let src = atts.get('src');

        if ( atts.get('nomodule') != null || this.Settings.bRunScripts) {
            let script = srcElm.text+'\n';
            const defines = atts.get('defines');
            const lvars: Array<[string,LVar]> = [];
            if (defines) 
                for (const name of defines.split(','))
                    lvars.push([name, this.NewVar(name)]);
                
            let exports: Object;
            return async function SCRIPT(this: RCompiler, {env}: Area) {
                if (bModule) {
                    // Execute the script now
                    if (!exports) {
                        if (!src) 
                            try {
                                script = script.replace(/(\sfrom\s*['"])(\.\.?\/)/g, `$1${this.FilePath}$2`);
                                // Thanks https://stackoverflow.com/a/67359410/2061591
                                src = URL.createObjectURL(new Blob([script], {type: 'application/javascript'}));
                                exports = await import(src);
                            }
                            finally { URL.revokeObjectURL(src); }
                        else
                            exports = await import(src);
                    }
                    for (const [name, init] of lvars) {
                        if (!(name in exports))
                            throw `'${name}' is not exported by this script`;
                        init(env)(exports[name]);
                    }
                }
                else  {
                    if (!exports) {
                        if (src)
                            script = await FetchText(src);
                        exports = globalEval(`'use strict'\n;${script};[${defines}]\n`) as Array<unknown>;
                    }
                    let i=0;
                    for (const [_,init] of lvars)
                        init(env)(exports[i++]);
                }
            };
        }
        return null;
    }

    public CompFor(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, atts: Atts, bBlockLevel: boolean): DOMBuilder {
        const varName = atts.get('let');
        let indexName = atts.get('index');
        if (indexName == '') indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) { /* A regular iteration */
                const getRange = this.CompAttrExpr<Iterable<Item>>(atts, 'of', true);
                let prevName = atts.get('previous');
                if (prevName == '') prevName = 'previous';
                let nextName = atts.get('next');
                if (nextName == '') nextName = 'next';

                const bReactive = CBool(atts.get('updateable') ?? atts.get('reactive'));
                const getUpdatesTo = this.CompAttrExpr<_RVAR>(atts, 'updates');
            
                // Voeg de loop-variabele toe aan de context
                const initVar = this.NewVar(varName);
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);
                const initNext = this.NewVar(nextName);

                const getKey = this.CompAttrExpr<Key>(atts, 'key');
                const getHash = this.CompAttrExpr<Hash>(atts, 'hash');

                // Compileer alle childNodes
                const bodyBuilder = this.CompChildNodes(srcElm);
                
                //srcParent.removeChild(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOR(this: RCompiler, area: Area) {
                    const {range, subArea} = PrepareArea(srcElm, area, '', true),
                        {parent, env} = subArea,
                        savedEnv = SaveEnv();
                    try {
                        // Map of previous data, if any
                        const keyMap: Map<Key, Range> = range.value ||= new Map(),
                        // Map of the newly obtained data
                            newMap: Map<Key, {item:Item, hash:Hash, index: number}> = new Map(),
                            setVar = initVar(env);

                        const iterator = getRange(env);
                        const setIndex = initIndex(env);
                        if (iterator) {
                            if (!(iterator[Symbol.iterator] || iterator[Symbol.asyncIterator]))
                                throw `[of]: Value (${iterator}) is not iterable`;
                            let index=0;
                            for await (const item of iterator) {
                                setVar(item);
                                setIndex(index);
                                const hash = getHash && getHash(env);
                                const key = getKey ? getKey(env) : hash;
                                if (key != null && newMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                newMap.set(key ?? {}, {item, hash, index});
                                index++;
                            }
                        }

                        let nextChild = range.child;

                        function RemoveStaleItems() {
                            let key: Key;
                            while (nextChild && !newMap.has(key = nextChild.key)) {
                                if (key != null)
                                    keyMap.delete(key);
                                for (const node of nextChild.Nodes())
                                    parent.removeChild(node);
                                nextChild.prev = null;
                                nextChild = nextChild.next;
                            }
                        }

                        const setPrevious = initPrevious(env);
                        const setNext = initNext(env);

                        let prevItem: Item = null, nextItem: Item
                            , prevRange: Range = null;
                        const nextIterator = nextName ? newMap.values() : null;
                        let childArea: Area;
                        subArea.parentR = range;

                        if (nextIterator) nextIterator.next();
                        RemoveStaleItems();

                        // Voor elke waarde in de range
                        for (const [key, {item, hash, index}] of newMap) {
                            if (nextIterator)
                                nextItem = nextIterator.next().value?.item;

                            let childRange = keyMap.get(key), bInit = !childRange;
                            if (bInit) {
                                // Item has to be newly created
                                subArea.range = null;
                                subArea.prevR = prevRange;
                                subArea.before = nextChild?.First || range.endMark;
                                ;({range: childRange, subArea: childArea} = PrepareArea(null, subArea, `${varName}(${index})`, true));
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
                                    const nextNode = nextChild?.First || range.endMark;
                                    parent.insertBefore(childRange.fragm, nextNode);
                                    childRange.fragm = null;
                                }
                                else
                                    while (true) {
                                        if (nextChild == childRange)
                                            nextChild = nextChild.next;
                                        else {
                                            // Item has to be moved
                                            const nextIndex = newMap.get(nextChild.key).index;
                                            if (nextIndex > index + 2) {
                                                const fragm = nextChild.fragm = document.createDocumentFragment();
                                                for (const node of nextChild.Nodes())
                                                    fragm.appendChild(node);
                                                
                                                nextChild = nextChild.next;
                                                continue;
                                            }

                                            childRange.prev.next = childRange.next;
                                            if (childRange.next)
                                                childRange.next.prev = childRange.prev;
                                            const nextNode = nextChild?.First || range.endMark;
                                            for (const node of childRange.Nodes())
                                                parent.insertBefore(node, nextNode);
                                        }
                                        break;
                                    }

                                childRange.text = `${varName}(${index})`;

                                if (prevRange) 
                                    prevRange.next = childRange;
                                else
                                    range.child = childRange;
                                subArea.range = childRange;
                                childArea = PrepareArea(null, subArea, '', true).subArea;
                                subArea.parentR = null;
                            }
                            childRange.prev = prevRange;
                            prevRange = childRange;

                            if (hash == null
                                ||  hash != childRange.hash as Hash
                                    && (childRange.hash = hash, true)
                            ) {
                                // Environment instellen
                                let rvar: Item =
                                    ( getUpdatesTo ? this.RVAR_Light(item as object, [getUpdatesTo(env)])
                                    : bReactive ? this.RVAR_Light(item as object)
                                    : item
                                    );
                                setVar(rvar);
                                setIndex(index);
                                setPrevious(prevItem);
                                if (nextIterator)
                                    setNext(nextItem)

                                // Body berekenen
                                await bodyBuilder.call(this, childArea);

                                if (bReactive && bInit)
                                    (rvar as _RVAR<Item>).Subscribe(
                                        new Subscriber(childArea, bodyBuilder, childRange.child)
                                    );
                            }

                            prevItem = item;
                            
                            RemoveStaleItems();
                        }
                        if (prevRange) prevRange.next = null; else range.child = null;
                    }
                    finally { RestoreEnv(savedEnv) }
                };
            }
            else { 
                /* Iterate over multiple slot instances */
                const slotName = atts.get('of', true, true).toLowerCase();
                const slot = this.Constructs.get(slotName)
                if (!slot)
                    throw `Missing attribute [let]`;

                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompChildNodes(srcElm, bBlockLevel);
                //srcParent.removeChild(srcElm);

                return async function FOREACH_Slot(this: RCompiler, area: Area) {
                    const {subArea} = PrepareArea(srcElm, area);
                    const env = subArea.env;
                    const saved= SaveEnv();
                    const slotDef = env.constructDefs.get(slotName);
                    try {
                        const setIndex = initIndex(area.env);
                        let index = 0;
                        for (const slotBuilder of slotDef.instanceBuilders) {
                            setIndex(index++);
                            env.constructDefs.set(slotName, {instanceBuilders: [slotBuilder], constructEnv: slotDef.constructEnv});
                            await bodyBuilder.call(this, subArea);
                        }
                    }
                    finally {
                        env.constructDefs.set(slotName, slotDef);
                        RestoreEnv(saved);
                    }
                }
            }
        }
        finally { this.RestoreContext(saved) }
    }

    private ParseSignature(elmSignature: Element):  Signature {
        const signature = new Signature(elmSignature);
        for (const attr of elmSignature.attributes) {
            if (signature.RestParam) 
                throw `Rest parameter must be the last`;
            const m = /^(#|\.\.\.)?(.*?)(\?)?$/.exec(attr.name);
            if (m[1] == '...')
                signature.RestParam = {name: m[2], pDefault: undefined};
            else
                signature.Parameters.push(
                    { name: m[2]
                    , pDefault: 
                        attr.value != '' 
                        ? (m[1] == '#' ? this.CompJavaScript(attr.value) :  this.CompInterpolatedString(attr.value))
                        : m[3] ? (_) => undefined
                        : null 
                    }
                );
            }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.localName, this.ParseSignature(elmSlot));
        return signature;
    }

    private CompComponent(srcParent: ParentNode, srcElm: HTMLElement, atts: Atts): DOMBuilder {
        //srcParent.removeChild(srcElm);

        const builders: [DOMBuilder, ChildNode][] = [];
        let signature: Signature, elmTemplate: HTMLTemplateElement;
        const bEncapsulate = CBool(atts.get('encapsulate'));
        const styles: Node[] = [];

        for (const srcChild of Array.from(srcElm.children) as Array<HTMLElement>  ) {
            const childAtts = new Atts(srcChild);
            let builder: DOMBuilder;
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    builder = this.CompScript(srcElm, srcChild as HTMLScriptElement, childAtts);
                    break;
                case 'STYLE':
                    if (bEncapsulate)
                        styles.push(srcChild);
                    else
                        this.CompStyle(srcChild);
                    
                    break;
                case 'TEMPLATE':
                    if (elmTemplate) throw 'Double <TEMPLATE>';
                    elmTemplate = srcChild as HTMLTemplateElement;
                    break;
                default:
                    if (signature) throw 'Double signature';
                    signature = this.ParseSignature(srcChild);
                    break;
            }
            if (builder) builders.push([builder, srcChild]);
        }
        if (!signature) throw `Missing signature`;
        if (!elmTemplate) throw 'Missing <TEMPLATE>';

        if (bEncapsulate && !signature.RestParam)
            signature.RestParam = {name: null, pDefault: null}
        this.AddConstruct(signature);
        
        
        const {name} = signature;
        // Deze builder bouwt de component-instances op
        const instanceBuilders = [
            this.CompTemplate(signature, elmTemplate.content, elmTemplate, 
                false, bEncapsulate, styles)
        ];

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return ( 
            async function COMPONENT(this: RCompiler, area: Area) {
                for (const [bldr, srcNode] of builders)
                    await this.CallWithErrorHandling(bldr, srcNode, area);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs
                const construct = {instanceBuilders, constructEnv: undefined as Environment};
                const {env} = area;
                const prevDef = env.constructDefs.get(name);
                env.constructDefs.set(name, construct);
                construct.constructEnv = CloneEnv(env);     // Contains circular reference to construct
                envActions.push(
                    () => { env.constructDefs.set(name,  prevDef) }
                );
            } );
    }

    private CompTemplate(signat: Signature, contentNode: ParentNode, srcElm: HTMLElement, 
        bNewNames: boolean, bEncaps?: boolean, styles?: Node[], atts?: Atts
    ): ParametrizedBuilder
    {
        const names: string[] = [], 
        saved = this.SaveContext(),
            bCheckAtts = !atts;
        if (bCheckAtts)
            atts = new Atts(srcElm);
        for (const param of signat.Parameters)
            names.push( (atts.get(`#${param.name}`) ?? atts.get(param.name, bNewNames)) || param.name);
        const {name, RestParam} = signat;
        if (RestParam?.name)
            names.push( atts.get(`...${RestParam.name}`, bNewNames) || RestParam.name);

        for (const S of signat.Slots.values())
            this.AddConstruct(S);
        if (bCheckAtts)
            atts.CheckNoAttsLeft();
        try {
            const lvars: LVar[] = names.map(name => this.NewVar(name));
            const builder = this.CompChildNodes(contentNode);
            const customName = /^[A-Z].*-/.test(name) ? name : `rhtml-${name}`;

            return async function TEMPLATE(this: RCompiler, area: Area, args: unknown[], mapSlotBuilders, slotEnv) {
                const saved = SaveEnv(),
                    {env} = area;
                try {
                    for (const [slotName, instanceBuilders] of mapSlotBuilders) {
                        const savedDef = env.constructDefs.get(slotName);
                        envActions.push(
                            () => { env.constructDefs.set(slotName, savedDef) }
                        );
                        env.constructDefs.set(slotName, {instanceBuilders, constructEnv: slotEnv});
                    }
                    let i = 0;
                    for (const lvar of lvars)
                        lvar(area.env)(args[i++]);

                    if (bEncaps) {
                        const {elmRange, childArea, bInit} = PrepareElement(srcElm, area, customName), 
                            elm = elmRange.node,
                            shadow = elm.shadowRoot || elm.attachShadow({mode: 'open'});
                        if (bInit)
                            for (const style of styles)
                                shadow.appendChild(style.cloneNode(true));

                        if (args[i])
                            ApplyModifier(elm, ModifType.RestArgument, null, args[i], bInit);
                        area = childArea;
                    }
                    await builder.call(this, area); 
                }
                finally { RestoreEnv(saved) }}

        }
        catch (err) {throw `${OuterOpenTag(srcElm)} ${err}` }
        finally { this.RestoreContext(saved) }
    }


    private CompInstance(
        srcParent: ParentNode, srcElm: HTMLElement, atts: Atts,
        signature: Signature
    ) {
        //srcParent.removeChild(srcElm);
        const {name} = signature;
        const getArgs: Array<Dependent<unknown>> = [];

        for (const {name, pDefault} of signature.Parameters)
            getArgs.push( this.CompParameter(atts, name, !pDefault) || pDefault );

        const slotBuilders = new Map<string, ParametrizedBuilder[]>();
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);

        let slotElm: HTMLElement, Slot: Signature;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE 
                && (Slot = signature.Slots.get((slotElm = (node as HTMLElement)).localName))
            ) {
                slotBuilders.get(slotElm.localName).push(
                    this.CompTemplate(Slot, slotElm, slotElm, true)
                );
                srcElm.removeChild(node);
            }
        
        const contentSlot = signature.Slots.get('content');
        if (contentSlot)
            slotBuilders.get('content').push(
                this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts)
            );

        const preModifiers = signature.RestParam ? this.CompAttributes(atts).preModifiers: null;

        atts.CheckNoAttsLeft();
        this.bTrimLeft = false;

        return async function INSTANCE(this: RCompiler, area: Area) {
            const {subArea} = PrepareArea(srcElm, area),
                env = area.env;

            // The construct-template(s) will be executed in this construct-env
            const {instanceBuilders, constructEnv} =  env.constructDefs.get(name);

            const args: unknown[] = [];
            for ( const getArg of getArgs)
                args.push(getArg(env));
            
            if (signature.RestParam) {
                const rest: RestParameter = [];
                for (const {modType, name, depValue} of preModifiers)
                    rest.push({modType, name, value: depValue(env)})
                
                args.push(rest);
            }
            
            const slotEnv = signature.Slots.size ? CloneEnv(env) : null;

            subArea.env = constructEnv
            for (const parBuilder of instanceBuilders) 
                await parBuilder.call(this, subArea, args, slotBuilders, slotEnv);
        }
    }

    static regTrimmable = /^(blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul)$/;
    private CompHTMLElement(srcElm: HTMLElement, atts: Atts) {
        // Remove trailing dots
        const name = srcElm.localName.replace(/\.+$/, '');
        const bTrim = RCompiler.regTrimmable.test(name)

        // We turn each given attribute into a modifier on created elements
        const {preModifiers, postModifiers} = this.CompAttributes(atts);

        if (bTrim) this.bTrimLeft = true;
        // Compile the given childnodes into a routine that builds the actual childnodes
        const childnodesBuilder = this.CompChildNodes(srcElm, bTrim);
        if (bTrim) this.bTrimLeft = true;

        // Now the runtime action
        const builder = async function ELEMENT(this: RCompiler, area: Area) {
            const {elmRange, childArea} = PrepareElement(srcElm, area, name), elm = elmRange.node;
            
            if (!area.bNoChildBuilding)
                // Add all children
                await childnodesBuilder.call(this, childArea);


            elm.removeAttribute('class');
            ApplyModifiers(elm, preModifiers, area);
            ApplyModifiers(elm, postModifiers, area)
        };

        builder.bTrim = bTrim;
        return builder;
    }

    private CompAttributes(atts: Atts) { 
        const preModifiers: Array<Modifier> = [], postModifiers: Array<Modifier> = [];

        for (const [attName, attValue] of atts) {
            let m: RegExpExecArray;
            try {
                if (m = /^on(create|update)$/i.exec(attName))
                    postModifiers.push({
                        modType: ModifType[attName], 
                        name: m[0], 
                        depValue: this.CompJavaScript<Handler>(
                            `function ${attName}(){${attValue}\n}`)
                    });
                else if (m = /^on(.*)$/i.exec(attName))               // Events
                    preModifiers.push({
                        modType: ModifType.Event, 
                        name: CapitalizeProp(m[0]), 
                        depValue: this.CompJavaScript<Handler>(
                            `function ${attName}(event){${attValue}\n}`)
                    });
                else if (m = /^#class:(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Class, name: m[1],
                        depValue: this.CompJavaScript<boolean>(attValue)
                    });
                else if (m = /^#style\.(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript<unknown>(attValue)
                    });
                else if (m = /^style\.(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompInterpolatedString(attValue)
                    });
                else if (attName == '+style')
                    preModifiers.push({
                        modType: ModifType.AddToStyle, name: null,
                        depValue: this.CompJavaScript<object>(attValue)
                    });
                else if (m = /^#(.*)/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Prop, name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript<unknown>(attValue)
                    });
                else if (attName == "+class")
                    preModifiers.push({
                        modType: ModifType.AddToClassList, name: null,
                        depValue: this.CompJavaScript<object>(attValue)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attName)) { // *, **, @, @@
                    const propName = CapitalizeProp(m[3]);                    
                    try {
                        const setter = this.CompJavaScript<Handler>(
                            `function(){const ORx=this.${propName};if(${attValue}!==ORx)${attValue}=ORx}`);
                        if (m[1] == '@')
                            preModifiers.push({ modType: ModifType.Prop, name: propName, depValue: this.CompJavaScript<unknown>(attValue) });
                        else
                            postModifiers.push({ modType: ModifType.oncreate, name: 'oncreate', depValue: setter });
                        preModifiers.push({modType: ModifType.Event, name: m[2] ? 'onchange' : 'oninput', depValue: setter});
                    }
                    catch(err) { throw `Invalid left-hand side '${attValue}'`}
                }
                else if (m = /^\.\.\.(.*)/.exec(attName)) {
                    if (attValue) throw `Rest parameter cannot have a value`;
                    preModifiers.push({
                        modType: ModifType.RestArgument, name: null,
                        depValue: this.CompName(m[1])
                    });
                }
                else
                    preModifiers.push({
                        modType: ModifType.Attr, name: attName,
                        depValue: this.CompInterpolatedString(attValue)
                    });
            }
            catch (err) {
                throw(`[${attName}]: ${err}`)
            }
        }
        atts.clear();
        return {preModifiers, postModifiers};
    }

    private CompStyle(srcStyle: HTMLElement): DOMBuilder  {
        this.StyleRoot.appendChild(srcStyle);
        this.AddedHeaderElements.push(srcStyle);
        return null;
        /*
        return (this.StyleRoot==document.head 
            ? this.CompCSSRuleList(document.styleSheets[document.styleSheets.length-1].cssRules)
            : null);
        */
    }
/*
    private CompStyleTemplate(srcParent: ParentNode, srcStyle1: HTMLElement, atts: Atts) {
        srcParent.removeChild(srcStyle1);
        const styleElement = document.createElement('STYLE') as HTMLStyleElement;
        styleElement.media = atts.get('media') ?? "";
        let depText = this.CompInterpolatedString(srcStyle1.textContent);

        return async (reg: Area)=> {
            if (reg.bInit && styleElement.isConnected)
                throw `A <STYLE.> stylesheet template cannot be invoked more than once`;
            styleElement.textContent = depText(reg.env);
            this.StyleRoot.insertBefore(styleElement, this.StyleBefore);
        }
    }
*/
/*
    private CompCSSRuleList(cssRules: CSSRuleList){
        const ruleSetters: Array<{
            style: CSSStyleDeclaration, 
            prop: string, 
            depValue: Dependent<string>, 
        }> = [];
        for (const  cssRule of cssRules)
            switch (cssRule.type) {
                case CSSRule.STYLE_RULE: {
                    const {style} = cssRule as CSSStyleRule;
                    for (const prop of style){
                        const depValue = this.CompInterpolatedString(style.getPropertyValue(prop), prop, true);
                        if (depValue)
                            ruleSetters.push({style, prop, depValue});
                    }
                }; break;
            }
        return (ruleSetters.length
            ? async ({env}: Area) => {
                for (const {style, prop, depValue} of ruleSetters)
                    style.setProperty(prop, depValue(env), style.getPropertyPriority(prop));
            }
            : null);
    }
//*/
    private CompInterpolatedString(data: string, name?: string): Dependent<string> & {isBlank?: boolean} {
        const generators: Array< string | Dependent<unknown> > = []
            , regIS = /(?<![\\$])\$?\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/gs;
        let isBlank = true, isTrivial = true;

        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data)
                , fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;

            if (fixed)
                generators.push( fixed.replace(/\\([${}\\])/g, '$1') );  // Replace '\{' etc by '{'
            if (m[1] || /[^ \t\r\n]/.test(fixed)) {
                isBlank = false;
                if (m[1]) {
                    generators.push( this.CompJavaScript<string>(m[1], '{}') );
                    isTrivial = false;
                }
            }
        }
        
        let dep: Dependent<string> & {isBlank?: boolean};
        if (isTrivial) {
            const result = (generators as Array<string>).join('');
            dep = () => result;
        } else
            dep = (env: Environment) => {
                    try {
                        let result = "";
                        for (const gen of generators)
                            result += ( typeof gen == 'string' ? gen : gen(env) ?? '');
                        return result;
                    }
                    catch (err) { throw name ? `[${name}]: ${err}` : err }
                };
        dep.isBlank = isBlank;
        dep.bThis = false;
        return dep;
    }

    // Compile a 'regular pattern' into a RegExp and a list of bound LVars
    private CompPattern(patt:string): {lvars: LVar[], regex: RegExp, url?: boolean}
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

        return {lvars, regex: new RegExp(`^${reg}$`, 'i')}; 
    }

    private CompParameter(atts: Atts, attName: string, bRequired?: boolean): Dependent<unknown> {
        const value = atts.get(attName);
        return (
            value == null ? this.CompAttrExpr(atts, attName, bRequired)
            : /^on/.test(attName) ? this.CompJavaScript(`function ${attName}(event){${value}\n}`)
            : this.CompInterpolatedString(value)
        );
    }
    private CompAttrExpr<T>(atts: Atts, attName: string, bRequired?: boolean) {
        return this.CompJavaScript<T>(atts.get(attName, bRequired, true));
    }

    private CompJavaScript<T>(
        expr: string,           // Expression to transform into a function
        delims: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
        , descript?: string             // To be inserted in an errormessage
    ): Dependent<T> {
        if (expr == null) return null;

        const bThis = /\bthis\b/.test(expr),
            depExpr = bThis ?
                `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
                : `'use strict';([${this.context}])=>(${expr}\n)`
            , errorInfo = `${descript ? `[${descript}] ` : ''}${delims[0]}${Abbreviate(expr,60)}${delims[1]}: `;

        try {
            const routine = globalEval(depExpr) as (env:Environment) => T
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
}


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
        initialValue?: T, 
        private store?: Store,
        private storeName?: string,
    ) {
        if (globalName) globalThis[globalName] = this;
        
        let s: string;
        if ((s = store && store.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch{}
        this._Value = initialValue;
        this.storeName ||= globalName;
    }
    // The value of the variable
    private _Value: T;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    Subscribers: Set<Subscriber> = new Set();

    Subscribe(s: Subscriber) {
        this.Subscribers.add(s);
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

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { 
        if (!bReadOnly) this.SetDirty();  
        return this._Value }
    set U(t: T) { this.V = t }

    public SetDirty() {
        if (this.store)
            this.MainC.DirtyVars.add(this);
        for (const sub of this.Subscribers)
            if (sub.before.isConnected)
                this.MainC.AddDirty(sub);
            else
                this.Subscribers.delete(sub);
        this.MainC.RUpdate();
    }

    public Save() {
        this.store.setItem(`RVAR_${this.storeName}`, JSON.stringify(this._Value));
    }
}

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
const words = '(?:align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
+ '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|line|margin|max|min|node|offset|outer'
+ '|outline|overflow|owner|padding|parent|right|size|rule|scroll|selected|table|tab(?=index)|text|top|value|variant)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalizeProp(lcName: string) {
    return lcName.replace(regCapitalize, (char) => char.toUpperCase());
}

function OuterOpenTag(elm: HTMLElement, maxLength?: number): string {
    return Abbreviate(/<.*?(?=>)/.exec(elm.outerHTML)[0], maxLength-1) + '>';
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

//function thrower(err: string = 'Internal error'): never { throw err }

function createErrorNode(message: string) {
    const node = document.createElement('div');        
    node.style.color = 'crimson';
    node.style.fontFamily = 'sans-serif';
    node.style.fontSize = '10pt';
    node.innerText = message;
    return node;
}

async function FetchText(url: string): Promise<string> {
    const response = await globalFetch(url);
    if (!response.ok)
        throw `GET '${url}' returned ${response.status} ${response.statusText}`;
    return await response.text();
}

export let RHTML = new RCompiler();

Object.defineProperties(
    globalThis, {
        RVAR:       {get: () => RHTML.RVAR.bind(RHTML)},
        RUpdate:    {get: () => RHTML.RUpdate.bind(RHTML)},
    }
);
globalThis.RCompile = RCompile;
export const 
    RVAR = globalThis.RVAR as <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>, 
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

function GetPath(url: string, base?: string) {
    const U = new URL(url, base);
    return U.origin + U.pathname.replace(/[^/]*$/, '');
}

export const docLocation: _RVAR<Location> & {subpath?: string} = RVAR<Location>('docLocation', location);
function SetLocation() {
    const subpath = location.pathname.substr(RootPath.length);
    if (docLocation.subpath != null && subpath != docLocation.subpath)
        docLocation.SetDirty();
    docLocation.subpath = subpath;
}

window.addEventListener('popstate', SetLocation );
export const reroute = globalThis.reroute = (arg: Event | string) => {
    history.pushState(null, null, typeof arg=='string' ? arg : (arg.target as HTMLAnchorElement).href );
    SetLocation();
    return false;
}