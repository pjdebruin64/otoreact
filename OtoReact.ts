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
type FullSettings = typeof defaultSettings
type Settings = { [Property in keyof FullSettings]+?: FullSettings[Property] };
let RootPath: string = null;

export function RCompile(elm: HTMLElement, settings?: Settings) {    
    try {
        const {rootPattern} = settings = {...defaultSettings, ...settings};
        if (rootPattern) {
            const url = document.location.href;
            const m = url.match(`^.*(${rootPattern})`);
            if (!m)
                throw `Root pattern '${rootPattern}' does not match URL '${url}'`;
            RootPath = (new URL(m[0])).pathname;
        }
        else
            RootPath = `${document.location.origin}${document.location.pathname}`;
        globalThis.RootPath = RootPath;
        SetDocLocation();

        const R = RHTML;
        R.Compile(elm, settings, true);
        R.ToBuild.push({parent: elm.parentElement, start: elm, bInit: true, env: NewEnv(), });

        if (R.Settings.bBuild)
            R.DoUpdate().then(() => elm.hidden = false);
        
        return R;
    }
    catch (err) {
        window.alert(`Re-Act error: ${err}`);
    }
}


// Een context is een rij identifiers die in een te transformeren DOM-tree kunnen voorkomen, maar waarvan de waarde nog niet bekend is
type Context = Array<string>;
// Een environment is een rij concrete waarden voor de identifiers IN EEN GEGEVEN CONTEXT
type Environment = 
    Array<unknown> 
    & { constructDefs: Map<string, ConstructDef> };
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
// Een afhankelijke waarde in een gegeven context is een waarde die afhangt van een environment.
// Dit wordt de betekenis, denotatie, van een expressie van type T.
type Dependent<T> = (env: Environment) => T;

type Marker = ChildNode & {
    nextM?: Marker, 
    rResult?: unknown, 
    rValue?: unknown,
    hash?: Hash, key?: Key, keyMap?: Map<Key, Subscriber>,
    errorNode?: Text,
};
type Region     = {
    parent: Element, 
    marker?: Marker, 
    start:  Marker, 
    bInit: boolean, 
    env: Environment,
    lastM?: Marker,
    bNoChildBuilding?: boolean,
};
type DOMBuilder = ((reg: Region) => Promise<void>) & {bTrim?: boolean};

type ConstructDef = {instanceBuilders: ParametrizedBuilder[], constructEnv: Environment};
type ParametrizedBuilder = 
    (this: RCompiler, reg: Region, args: unknown[], mapSlotBuilders: Map<string, ParametrizedBuilder[]>, slotEnv: Environment)
    => Promise<void>;

type ParentNode = HTMLElement|DocumentFragment;
//type FragmentCompiler = (srcParent: ParentNode, srcElm: HTMLElement) => ElmBuilder

type Subscriber = {
    parent: Element,
    marker?: ChildNode, start?: ChildNode,
    env: Environment, 
    builder: DOMBuilder } 
    & ( {marker: ChildNode} | {start: ChildNode});    // Either a marker or a startnode

type Handler = (ev:Event) => any;
type LVar = (env: Environment) => (value: unknown) => void;

interface Item {};  // Three unknown but distinct types
interface Key {};
interface Hash {};

type Parameter = {name: string, pDefault: Dependent<unknown>};
class Signature {
    constructor(
        public tagName: string,
    ){ }
    public Parameters: Array<Parameter> = [];
    public RestParam: Parameter = null;
    public Slots = new Map<string, Signature>();

    Equals(sig: Signature): boolean {
        let result =
            sig
            && this.tagName == sig.tagName
            && this.Parameters.length == sig.Parameters.length
            && this.Slots.size == sig.Slots.size;
        
        for (let i=0;i<this.Parameters.length;i++)
            result &&= this.Parameters[i].name == sig.Parameters[i].name;
        result &&= this.RestParam?.name == sig.RestParam?.name;

        for (let [slotname, slotSig] of this.Slots)
            result &&= slotSig.Equals(sig.Slots.get(slotname));
        
        return result;
    }
}

type RVAR_Light<T> = T & {
    _Subscribers?: Array<Subscriber>,
    _UpdatesTo?: Array<_RVAR<unknown>>,
    Subscribe?: (sub:Subscriber) => void
};

const globalEval = eval, globalFetch = fetch;

enum ModifierType {Attr, Prop, Class, Style, Event, AddToStyle, AddToClassList, RestArgument,
    PseudoEvent,
};
type Modifier = {
    modType: ModifierType,
    name: string,
    depValue: Dependent<unknown>,
    tag?: string,
}
type RestParameter = Array<{modType: ModifierType, name: string, value: unknown}>;

function ApplyModifier(elm: HTMLElement, modType: ModifierType, name: string, val: unknown) {    
    switch (modType) {
        case ModifierType.Attr:
            elm.setAttribute(name, val as string ?? ''); 
            break;
        case ModifierType.Prop:
            if (val != null)
                elm[name] = val;
            else
                delete elm[name];
            break;
        case ModifierType.Event:
            elm[name] = val; break;
        case ModifierType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModifierType.Style:
            if (val !== undefined)
                elm.style[name] = val ?? '';
            break;
        case ModifierType.AddToStyle:
            Object.assign(elm.style, val); break
        case ModifierType.AddToClassList:
            if (Array.isArray(val))
                for (const className of val as string[])
                    elm.classList.add(className);
            else
                for (const [className, bln] of Object.entries<boolean>(val as {}))
                    if (bln)
                        elm.classList.add(className);
            break;
        case ModifierType.RestArgument:
            for (const {modType, name, value} of val as RestParameter)
                ApplyModifier(elm, modType, name, value);
            break;
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

let num=0;
class RCompiler {
    instanceNum = num++;
    private Context: Context;
    private ContextMap: Map<string, number>;

    private Constructs: Map<string, Signature>;
    AddedHeaderElements: Array<HTMLElement>;

    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(clone?: RCompiler) { 
        this.Context    = clone ? clone.Context.slice() : [];
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings   = clone ? {...clone.Settings} : {...defaultSettings};
        this.AddedHeaderElements = clone ? clone.AddedHeaderElements : [];
    }

    private restoreActions: Array<() => void> = [];

    private SaveContext(): SavedContext {
        return this.restoreActions.length;
    }
    private RestoreContext(savedContext: SavedContext) {
        for (let j=this.restoreActions.length; j>savedContext; j--)
            this.restoreActions.pop()();
    }

    private NewVar(name: string): LVar {
        if (!name)
            // Lege variabelenamen staan we toe; dan wordt er niets gedefinieerd
            return (_) => (_) => {};
       
        name = CheckValidIdentifier(name);

        let i = this.ContextMap.get(name);
        const bNewName = i == null;
        if (bNewName){
            i = this.Context.push(name) - 1;
            this.ContextMap.set(name, i);
            this.restoreActions.push(
                () => this.ContextMap.delete( this.Context.pop() )
            );
        }
        return function InitVar(env: Environment) {
            const prev = env[i], j=i;
            envActions.push( () => {env[j] = prev } );
            
            return (value: unknown) => {env[j] = value };
        }.bind(this) as LVar            
    }

    private AddConstruct(C: Signature) {
        const CName = C.tagName;
        const savedConstr = this.Constructs.get(CName);
        this.Constructs.set(CName, C);
        this.restoreActions.push(
            () => this.Constructs.set(CName, savedConstr)
        );
    }

    // Compile a source tree into an ElmBuilder
    public Compile(
        elm: HTMLElement, 
        settings: Settings,
        bIncludeSelf: boolean,
    ) {
        this.Settings = {...defaultSettings, ...settings, };
        const t0 = Date.now();
        const savedR = RHTML; RHTML = this;
        if (bIncludeSelf)
            this.Builder = this.CompileElement(elm.parentElement, elm)[0];
        else
            this.Builder = this.CompileChildNodes(elm);

        this.bCompiled = true;
        RHTML = savedR;
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
    }

    public async Build(reg: Region & {marker?: ChildNode}) {
        const savedRCompiler = RHTML, start = reg.start;
        RHTML = this;
        await this.Builder(reg);
        if (reg.marker)
            this.AllRegions.push({
                parent: reg.parent, marker: reg.marker, builder: this.Builder, env: NewEnv()
            });
        else
            this.AllRegions.push({
                parent: reg.parent, start, builder: this.Builder, env: NewEnv()
            });
        RHTML = savedRCompiler;
    }

    public Settings: FullSettings;
    public ToBuild: Region[] = [];
    private AllRegions: Subscriber[] = [];
    private Builder: DOMBuilder;
    private bTrimLeft: boolean = false;
    private bTrimRight: boolean = false;

    private bCompiled = false;
    private bHasReacts = false;

    private DirtySubs = new Map<ChildNode, Subscriber>();
    public AddDirty(sub: Subscriber) {
        this.DirtySubs.set((sub.marker || sub.start), sub)
    }

    // Bijwerken van alle elementen die afhangen van reactieve variabelen
    private bUpdating = false;
    private handleUpdate: number = null;
    RUpdate() {
        //clearTimeout(this.handleUpdate);
        if (!this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 0);
    };

    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        
        this.bUpdating = true;
        let savedRCompiler = RHTML;
        try {
            if (this.ToBuild.length) {
                const t0 = Date.now();
                this.builtNodeCount = 0;
                for (const reg of this.ToBuild)
                    await this.Build(reg);
                console.log(`Built ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
                this.ToBuild = [];
            }

            if (!this.bHasReacts)
                for (const s of this.AllRegions)
                    this.AddDirty(s);
            
            if (this.DirtySubs.size) {
                RHTML = this;
                const t0 = Date.now();
                this.builtNodeCount = 0;
                for (const {parent, marker, start, builder, env} of this.DirtySubs.values()) {
                    try { 
                        await builder.call(this, 
                            { parent, 
                            start: start || marker?.nextSibling || parent.firstChild, 
                            env, }); 
                    }
                    catch (err) {
                        const msg = `ERROR: ${err}`;
                        console.log(msg);
                    }
                }
                console.log(`Updated ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
            }
        }
        finally { 
            this.DirtySubs.clear();
            RHTML = savedRCompiler;this.bUpdating = false;
         }
    }

    /* A "responsive variable" is a variable which listeners can subscribe to.
    */
    RVAR<T>(
        name?: string, 
        initialValue?: T, 
        store?: Store
    ) {
        return new _RVAR<T>(this, name, initialValue, store, name);
    }; // as <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>;
    
    private RVAR_Light<T>(
        t: RVAR_Light<T>, 
        //: Array<Subscriber> = [],
        updatesTo: Array<_RVAR<unknown>> = [],
    ): RVAR_Light<T> {
        if (!t._Subscribers) {
            t._Subscribers = []; //subscribers;
            t._UpdatesTo = updatesTo;
            const R: RCompiler = this;
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

    private CompileChildNodes(
        srcParent: ParentNode,
        bBlockLevel?: boolean,
        childNodes: ChildNode[] = Array.from( srcParent.childNodes ),
        bNorestore?: boolean
    ): DOMBuilder {
        const builders = [] as Array< [DOMBuilder, ChildNode, boolean?] >;
        const saved = this.SaveContext();
        this.sourceNodeCount += childNodes.length;
        try {
            for (const srcNode of childNodes)
            {
                switch (srcNode.nodeType) {
                    
                    case Node.ELEMENT_NODE:
                        const builderElm = this.CompileElement(srcParent, srcNode as HTMLElement, bBlockLevel);
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
                        const str = (srcNode as Text).data
                            .replace(/^[ \t\r\n]+/g, this.bTrimLeft ? '' : ' ')
                            .replace(/\[ \t\r\n]+$/, ' ');

                        if (str != '') {
                            this.bTrimLeft = / $/.test(str);
                            const getText = this.CompileInterpolatedString( str );
                            async function Text(region: Region) {
                                const {start, lastM, bInit} = region, content = getText(region.env);
                                let text: Text;
                                if (bInit && start != srcNode)
                                    text = region.parent.insertBefore(document.createTextNode(content), start);
                                else {
                                    (text = (start as Text)).data = content;
                                    region.start = start.nextSibling;
                                }
                                if (lastM) {
                                    lastM.nextM = text;
                                    region.lastM = null;
                                }
                                
                            }

                            builders.push( [ Text, srcNode, getText.isBlank] );
                        }
                        else
                            srcParent.removeChild(srcNode);
                        break;

                    default:    // Other nodes (especially comments) are removed
                        srcParent.removeChild(srcNode);
                        continue;
                }
            };
        }
        finally {
            if (!bNorestore) this.RestoreContext(saved);
        }
        return async function ChildNodes(this: RCompiler, region) {
                const savedEnv = SaveEnv();
                try {
                    for (const [builder, node] of builders)
                        await this.CallWithErrorHandling(builder, node, region);
                    this.builtNodeCount += builders.length;
                }
                finally {
                    if (!bNorestore) RestoreEnv(savedEnv);
                }
            };
    }

    private preMods = ['reacton','reactson','thisreactson'];
    private CompileElement(srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel?: boolean): [DOMBuilder, ChildNode] {
        let builder: DOMBuilder = null;
        let reactingRvars: Array<Dependent<_RVAR<unknown>>>, bNoChildUpdates: boolean;
        for (const reactonAtt of this.preMods) {
            const val = GetAttribute(srcElm, reactonAtt);
            if (val) {            
                this.bHasReacts = true;
                bNoChildUpdates = (reactonAtt == 'thisreactson');
                reactingRvars = val.split(',').map( expr => this.CompileExpression<_RVAR<unknown>>(expr) );
                break;
            }
        }
labelNoCheck:
        try {
            // See if this node is a user-defined construct (component or slot) instance
            const construct = this.Constructs.get(srcElm.tagName);
            if (construct)
                builder = this.CompileConstructInstance(srcParent, srcElm, construct);
            else {
                switch (srcElm.nodeName) {
                    case 'DEF':
                    case 'DEFINE': { // 'LET' staat de parser niet toe.
                        // En <DEFINE> moet helaas afgesloten worden met </DEFINE>; <DEFINE /> wordt niet herkend.
                        srcParent.removeChild(srcElm);
                        const rvarName = GetAttribute(srcElm, 'rvar');
                        const varName = rvarName || GetAttribute(srcElm, 'name') || GetAttribute(srcElm, 'var', true);
                        const getValue = this.CompileAttribute(srcElm, 'value');
                        const getStore = rvarName && this.CompileAttrExpression<Store>(srcElm, 'store');
                        const newVar = this.NewVar(varName);
                        const bReact = GetAttribute(srcElm, 'react') != null;
                        const subBuilder = this.CompileChildNodes(srcElm);

                        builder = async function DEFINE(this: RCompiler, region) {
                                const subRegion = PrepareRegion(srcElm, region, undefined, undefined, varName);
                                const {marker} = subRegion;
                                if (region.bInit || bReact){
                                    const value = getValue && getValue(region.env);
                                    marker.rValue = rvarName 
                                        ? new _RVAR(this, null, value, getStore && getStore(region.env), rvarName) 
                                        : value;
                                }
                                newVar(region.env)(marker.rValue);
                                await subBuilder.call(this, subRegion);
                            };
                    } break;

                    case 'IF':
                    case 'CASE': {
                        const bHiding = CBool(GetAttribute(srcElm, 'hiding'));
                        const caseList: Array<{
                            condition: Dependent<unknown>,
                            patt: {lvars: LVar[], regex: RegExp, url?: boolean},
                            builder: DOMBuilder, 
                            childElm: HTMLElement,
                        }> = [];
                        const getCondition = (srcElm.nodeName == 'IF') && this.CompileAttrExpression<boolean>(srcElm, 'cond', true);
                        const getValue = this.CompileAttrExpression<string>(srcElm, 'value');
                        CheckNoAttributesLeft(srcElm);
                        const bodyNodes: ChildNode[] = [];
                        const bTrimLeft = this.bTrimLeft;
                        for (const child of srcElm.childNodes) {
                            if (child.nodeType == Node.ELEMENT_NODE) {
                                const childElm = child as HTMLElement
                                this.bTrimLeft = bTrimLeft;
                                const saved = this.SaveContext();
                                try {
                                    let condition: Dependent<unknown>;
                                    let patt:  {lvars: LVar[], regex: RegExp, url?: boolean};
                                    switch (child.nodeName) {
                                        case 'WHEN':                                
                                            condition = this.CompileAttrExpression<unknown>(childElm, 'cond');
                                            let pattern: string;
                                            if ((pattern = GetAttribute(childElm, 'match')) != null)
                                                patt = this.CompilePattern(pattern);
                                            else if ((pattern = GetAttribute(childElm, 'urlmatch')) != null)
                                                (patt = this.CompilePattern(pattern)).url = true;
                                            else if ((pattern = GetAttribute(childElm, 'regmatch')) != null) {
                                                const lvars = GetAttribute(childElm, 'captures')?.split(',') || []
                                                patt = {regex: new RegExp(pattern, 'i'), lvars: lvars.map(this.NewVar.bind(this))};
                                            }
                                            else 
                                                patt = null;

                                            if (bHiding && patt?.lvars?.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !getValue)
                                                throw `A match is requested but no 'value' is specified.`;

                                        // Fall through!
                                        case 'ELSE':
                                            const builder = this.CompileChildNodes(childElm, bBlockLevel);
                                            caseList.push({condition, patt, builder, childElm});
                                            CheckNoAttributesLeft(childElm);
                                            continue;
                                    }
                                } 
                                catch (err) { throw `${OuterOpenTag(childElm)}${err}`  }
                                finally { this.RestoreContext(saved) }
                            }
                            bodyNodes.push(child);
                        }
                        if (getCondition)
                            caseList.unshift({
                                condition: getCondition, patt: null,
                                builder: this.CompileChildNodes(srcElm, bBlockLevel, bodyNodes),
                                childElm: srcElm
                            });

                        builder = 
                            async function CASE(this: RCompiler, region) {
                                const value = getValue && getValue(region.env);
                                let choosenAlt: typeof caseList[0] = null;
                                let matchResult: RegExpExecArray;
                                for (const alt of caseList)
                                    try {
                                        if (
                                            (!alt.condition || alt.condition(region.env)) 
                                            && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))
                                            )
                                        { choosenAlt = alt; break }
                                    } catch (err) { throw `${OuterOpenTag(alt.childElm)}${err}` }
                                if (bHiding) {
                                    // In this CASE variant, all subtrees are kept in place, some are hidden
                                    let {start, bInit, env} = PrepareRegion(srcElm, region, null, region.bInit);
                                        
                                    for (const alt of caseList) {
                                        const bHidden = alt != choosenAlt;
                                        let elm: HTMLElement;
                                        if (!bInit || start == srcElm) {
                                            elm = start as HTMLElement;
                                            start = start.nextSibling;
                                        }
                                        else
                                            region.parent.insertBefore(
                                                elm = document.createElement(alt.childElm.nodeName),
                                                start);
                                        elm.hidden = bHidden;
                                        if ((!bHidden || bInit) && !region.bNoChildBuilding)
                                            await this.CallWithErrorHandling(alt.builder, alt.childElm, {parent: elm, start: elm.firstChild, bInit, env} );
                                    }
                                }
                                else {
                                    // This is the regular CASE                                
                                    const subregion = PrepareRegion(srcElm, region, choosenAlt);
                                    if (choosenAlt) {
                                        const saved = SaveEnv();
                                        try {
                                            if (choosenAlt.patt) {
                                                let i=1;
                                                for (const lvar of choosenAlt.patt.lvars)
                                                    lvar(region.env)(
                                                        (choosenAlt.patt.url ? decodeURIComponent : (r: string) => r)
                                                        (matchResult[i++])
                                                    );
                                            }
                                            await this.CallWithErrorHandling(choosenAlt.builder, choosenAlt.childElm, subregion );
                                        } finally { RestoreEnv(saved) }
                                    }
                                }
                        };
                        this.bTrimLeft = false;
                    } break;
                            
                    case 'FOR':
                    case 'FOREACH':
                        builder = this.CompileForeach(srcParent, srcElm, bBlockLevel);
                    break;
                        
                    case 'INCLUDE': {
                        const src = GetAttribute(srcElm, 'src', true);
                        // Placeholder that will contain a Template when the file has been received
                        let C: RCompiler = new RCompiler(this);
                        
                        const task = (async () => {
                            const response = await globalFetch(src);
                            //if (response.status != 200)

                            const textContent = await response.text();
                            // Parse the contents of the file
                            const parser = new DOMParser();
                            const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;

                            // Compile the parsed contents of the file in the original context
                            C.Compile(parsedContent.body, this.Settings, false);
                            this.bHasReacts ||= C.bHasReacts;
                        })();

                        builder = 
                            // Runtime routine
                            async function INCLUDE(region) {
                                const subregion = PrepareRegion(srcElm, region);

                                await task;
                                await C.Builder(subregion);
                            };
                    } break;

                    case 'IMPORT': {
                        const src = GetAttribute(srcElm, 'src', true);
                        const listImports = new Array<[Signature, ConstructDef]>();
                        const dummyEnv = NewEnv();
                        
                        for (const child of srcElm.children) {
                            const signature = this.ParseSignature(child);
                            const holdOn: ParametrizedBuilder =
                            async function holdOn(this: RCompiler, region, args, mapSlotBuilders, slotEnv) {
                                await task;
                                region.env = placeholder.constructEnv;
                                for (const builder of placeholder.instanceBuilders)
                                    await builder.call(this, region, args, mapSlotBuilders, slotEnv);
                            }
                            const placeholder: ConstructDef = {instanceBuilders: [holdOn], constructEnv: dummyEnv} ;

                            listImports.push([signature, placeholder]);
                            
                            this.AddConstruct(signature);
                        }
                        const compiler = new RCompiler();
                        compiler.Settings.bRunScripts = true;
                        
                        const task =
                            (async () => {
                                let promiseModule = Modules.get(src);
                                if (!promiseModule) {
                                    promiseModule = globalFetch(src)
                                    .then(async response => {
                                        const textContent = await response.text();
                                        // Parse the contents of the file
                                        const parser = new DOMParser();
                                        const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;
                                        const builder = compiler.CompileChildNodes(parsedContent.body, true, undefined, true);
                                        this.bHasReacts ||= compiler.bHasReacts;

                                        const env = NewEnv();
                                        await builder.call(this, {parent: parsedContent.body, start: null, bInit: true, env});
                                        return {Signatures: compiler.Constructs, ConstructDefs: env.constructDefs};
                                    });
                                    Modules.set(src, promiseModule);
                                }
                                const module = await promiseModule;
                                
                                for (const [clientSig, placeholder] of listImports) {
                                    const {tagName} = clientSig;
                                    const signature = module.Signatures.get(tagName);
                                    if (!signature)
                                        throw `<${tagName}> is missing in '${src}'`;
                                    if (!clientSig.Equals(signature))
                                        throw `Imported signature <${tagName}> is unequal to module signature <${tagName}>`;
                                    
                                    const constructdef = module.ConstructDefs.get(tagName);
                                    placeholder.instanceBuilders = constructdef.instanceBuilders;
                                    placeholder.constructEnv = constructdef.constructEnv;
                                }
                            })();
                        
                        srcParent.removeChild(srcElm);

                        builder = async function IMPORT({env}: Region) {
                            for (const [{tagName: TagName}, constructDef] of listImports.values()) {
                                const prevDef = env.constructDefs.get(TagName);
                                env.constructDefs.set(TagName, constructDef);
                                envActions.push(
                                    () => { env.constructDefs.set(TagName,  prevDef) }
                                );
                            }
                        }

                    }; break

                    case 'REACT': {
                        this.bHasReacts = true;
                        const expList = GetAttribute(srcElm, 'on', true, true).split(',');
                        const getDependencies = expList.map( expr => this.CompileExpression<_RVAR<unknown>>(expr) );

                        // We transformeren de template in een routine die gewenste content genereert
                        const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                        
                        builder = async function REACT(this: RCompiler, region) {
                            let subregion = PrepareRegion(srcElm, region);

                            if (subregion.bInit) {
                                if (subregion.start == srcElm) {
                                    subregion.start = srcElm.firstChild;
                                    srcElm.replaceWith(...srcElm.childNodes );
                                }

                                const subscriber: Subscriber = {
                                    parent: subregion.parent, marker: subregion.marker,
                                    builder: bodyBuilder,
                                    env: CloneEnv(subregion.env),
                                };
                        
                                // Subscribe bij de gegeven variabelen
                                for (const getRvar of getDependencies) {
                                    const rvar = getRvar(subregion.env);
                                    rvar.Subscribe(subscriber);
                                }
                            }
        
                            await bodyBuilder.call(this, subregion);
                        }
                    } break;

                    case 'RHTML': {
                        const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                        srcParent.removeChild(srcElm);

                        builder = async function RHTML(this: RCompiler, region) {
                            const tempElm = document.createElement('RHTML');
                            await bodyBuilder.call(this, {parent: tempElm, start: null, env: region.env, bInit: true});
                            const result = tempElm.innerText

                            const subregion = PrepareRegion(srcElm, region, result);

                            if (subregion.bInit) {
                                tempElm.innerHTML = result;

                                const R = new RCompiler();
                                subregion.env = NewEnv();

                                const hdrElements = subregion.marker['AddedHeaderElements'] as Array<HTMLElement>;
                                if (hdrElements)
                                    for (const elm of hdrElements)
                                        document.head.removeChild(elm);

                                R.Compile(tempElm, {bRunScripts: true }, false);
                                subregion.marker['AddedHeaderElements'] = R.AddedHeaderElements;

                                await R.Build(subregion);
                            }
                        };
                    } break;

                    case 'SCRIPT': 
                        builder = this.CompileScript(srcParent, srcElm as HTMLScriptElement); break;

                    case 'STYLE':
                        builder = this.CompileStyle(srcParent, srcElm); break;

                    case 'COMPONENT': 
                        builder = this.CompileComponent(srcParent, srcElm); break;

                    default:             
                        /* It's a regular element that should be included in the runtime output */
                        builder = this.CompileHTMLElement(srcElm); 
                        break labelNoCheck;
                }
                CheckNoAttributesLeft(srcElm);
            }
        }
        catch (err) { 
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }

        if (reactingRvars) {
            const bodyBuilder = builder;
            builder = async function REACT(this: RCompiler, region) {
                let {parent, marker} = PrepareRegion(srcElm, region, null, null, 'reacton');

                await bodyBuilder.call(this, region);

                if (region.bInit) {
                    const subscriber: Subscriber = {
                        parent, marker,
                        builder: async function reacton(this: RCompiler, reg: Region) {
                            if (bNoChildUpdates && !reg.bInit) reg.bNoChildBuilding = true;
                            await this.CallWithErrorHandling(bodyBuilder, srcElm, reg);
                            this.builtNodeCount ++;
                        },
                        env: CloneEnv(region.env),
                    };
            
                    // Subscribe bij de gegeven variabelen
                    for (const getRvar of reactingRvars) {
                        const rvar = getRvar(region.env);
                        rvar.Subscribe(subscriber);
                    }
                }
            }
        }
        if (builder)
            return [builder, srcElm];
        return null;
    }

    private async CallWithErrorHandling(this: RCompiler, builder: DOMBuilder, srcNode: ChildNode, region: Region){
        let start = region.start;
        if (start?.errorNode) {
            region.parent.removeChild(start.errorNode);
            start.errorNode = undefined;
        }
        try {
            //await builder(region);
            await builder.call(this, region);
        } 
        catch (err) { 
            const message = 
                srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode =
                    region.parent.insertBefore(
                        document.createTextNode(message), region.start
                    );
                if (start ||= region.marker)
                    start.errorNode = errorNode;
            }
        }
    }

    private CompileScript(this:RCompiler, srcParent: ParentNode, srcElm: HTMLScriptElement) {
        srcParent.removeChild(srcElm);
        const type = GetAttribute(srcElm, 'type')
        const src = GetAttribute(srcElm, 'src');
        if ( GetAttribute(srcElm, 'nomodule') != null || this.Settings.bRunScripts) {
            let script = srcElm.text;
            
            const defines = GetAttribute(srcElm, 'defines');
            if (defines)
                for (let name of defines.split(',')) {
                    name = CheckValidIdentifier(name);
                    script += `;globalThis.${name} = ${name}\n`
                }
            
            const elm = document.createElement('script') as HTMLScriptElement;
            //elm.type = srcElm.type;
            if (src)
                elm.src = src;
            else
                elm.text = `'use strict';{${script}\n}`;
            document.head.appendChild(elm);
            this.AddedHeaderElements.push(elm);
        }
        return null;
    }

    private CompileStyle(srcParent: ParentNode, srcElm: HTMLElement): DOMBuilder {
        srcParent.removeChild(srcElm);
        document.head.appendChild(srcElm);
        this.AddedHeaderElements.push(srcElm);
        return null;
    }

    public CompileForeach(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel: boolean): DOMBuilder {
        const varName = GetAttribute(srcElm, 'let');
        let indexName = GetAttribute(srcElm, 'index');
        if (indexName == '') indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) { /* A regular iteration */
                const getRange = this.CompileAttrExpression<Iterable<Item>>(srcElm, 'of', true);
                let prevName = GetAttribute(srcElm, 'previous');
                if (prevName == '') prevName = 'previous';
                let nextName = GetAttribute(srcElm, 'next');
                if (nextName == '') nextName = 'next';

                const bReactive = CBool(GetAttribute(srcElm, 'updateable') ?? GetAttribute(srcElm, 'reactive'));
                const getUpdatesTo = this.CompileAttrExpression<_RVAR<unknown>>(srcElm, 'updates');
            
                // Voeg de loop-variabele toe aan de context
                const initVar = this.NewVar(varName);
                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);
                const initNext = this.NewVar(nextName);

                const getKey = this.CompileAttrExpression<Key>(srcElm, 'key');
                const getHash = this.CompileAttrExpression<Hash>(srcElm, 'hash');

                // Compileer alle childNodes
                const bodyBuilder = this.CompileChildNodes(srcElm);
                
                srcParent.removeChild(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return async function FOREACH(this: RCompiler, region: Region) {
                    let subregion = PrepareRegion(srcElm, region, null, (getKey == null));
                    let {parent, marker, start, env} = subregion;
                    const savedEnv = SaveEnv();
                    try {
                        // Map of previous data, if any
                        const keyMap: Map<Key, Subscriber>
                            = (region.bInit ? marker.keyMap = new Map() : marker.keyMap);
                        // Map of the newly obtained data
                        const newMap: Map<Key, {item:Item, hash:Hash}> = new Map();
                        const setVar = initVar(env);

                        const iterator = getRange(env);
                        if (!iterator || typeof iterator[Symbol.iterator] != 'function')
                            throw `[of]: Value (${iterator}) is not iterable`;
                        for (const item of iterator) {
                            setVar(item);
                            const hash = getHash && getHash(env);
                            const key = getKey ? getKey(env) : hash;
                            if (key != null && newMap.has(key))
                                throw `Key '${key}' is not unique`;
                            newMap.set(key ?? {}, {item, hash});
                        }

                        function RemoveStaleItemsHere() {
                            let key: Key;
                            while (start && start != region.start && !newMap.has(key = start.key)) {
                                if (key != null)
                                    keyMap.delete(key);
                                const nextMarker = start.nextM;
                                while (start != nextMarker) {
                                    const next = start.nextSibling;
                                    parent.removeChild(start);
                                    start = next;
                                }
                            }
                        }
                        RemoveStaleItemsHere();

                        const setIndex = initIndex(env);
                        const setPrevious = initPrevious(env);
                        const setNext = initNext(env);

                        let index = 0, prevItem: Item = null;
                        const nextIterator = nextName ? newMap.values() : null;
                        if (nextIterator) nextIterator.next();
                        // Voor elke waarde in de range
                        for (const [key, {item, hash}] of newMap) {
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
                                setNext(nextIterator.next().value?.item)

                            let marker: Marker;
                            let subscriber = keyMap.get(key);
                            let childRegion: ReturnType<typeof PrepareRegion>;
                            if (subscriber && subscriber.marker.isConnected) {
                                // Item already occurs in the series
                                marker = subscriber.marker;
                                const nextMarker = marker.nextM;
                                
                                if (marker != start) {
                                    // Item has to be moved
                                    let node = marker
                                    while(node != nextMarker) {
                                        const next = node.nextSibling;
                                        parent.insertBefore(node, start);
                                        node = next;
                                    }
                                }
                                
                                (marker as Comment).textContent = `${varName}(${index})`;

                                subregion.bInit = false;
                                subregion.start = marker;
                                const lastM = subregion.lastM;
                                childRegion = PrepareRegion(null, subregion, null, false);
                                if (lastM)
                                    lastM.nextM = marker;
                                subregion.lastM = marker;
                            }
                            else {
                                // Item has to be newly created
                                subregion.bInit = true;
                                subregion.start = start;
                                childRegion = PrepareRegion(null,  subregion, null, true, `${varName}(${index})`);
                                subscriber = {
                                    ...childRegion,
                                    builder: (bReactive ? bodyBuilder : undefined),
                                    env: (bReactive ? CloneEnv(env) : undefined), 
                                }
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, subscriber);
                                }
                                marker = childRegion.marker
                                marker.key = key;
                            }

                            if (hash != null
                                && ( hash == marker.hash as Hash
                                    || (marker.hash = hash, false)
                                    )
                            ) { 
                                // Nothing
                            }
                            else    // Body berekenen
                                await bodyBuilder.call(this, childRegion);

                            if (bReactive)
                                (rvar as _RVAR<Item>).Subscribe(subscriber);

                            prevItem = item;
                            index++;
                            
                            start = subregion.start;
                            RemoveStaleItemsHere();
                        }
                    }
                    finally { RestoreEnv(savedEnv) }
                };
            }
            else { 
                /* Iterate over multiple slot instances */
                const slotName = GetAttribute(srcElm, 'of', true, true);
                const slot = this.Constructs.get(slotName)
                if (!slot)
                    throw `Missing attribute [let]`;

                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                srcParent.removeChild(srcElm);

                return async function FOREACH_Slot(this: RCompiler, region: Region) {
                    const subregion = PrepareRegion(srcElm, region);
                    const env = subregion.env;
                    const saved= SaveEnv();
                    const slotDef = env.constructDefs.get(slotName);
                    try {
                        const setIndex = initIndex(region.env);
                        let index = 0;
                        for (const slotBuilder of slotDef.instanceBuilders) {
                            setIndex(index++);
                            env.constructDefs.set(slotName, {instanceBuilders: [slotBuilder], constructEnv: slotDef.constructEnv});
                            await bodyBuilder.call(this, subregion);
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
        const signature = new Signature(elmSignature.tagName);
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
                        ? (m[1] == '#' ? this.CompileExpression(attr.value) :  this.CompileInterpolatedString(attr.value))
                        : m[3] ? (_) => undefined
                        : null 
                    }
                );
            }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.tagName, this.ParseSignature(elmSlot));
        return signature;
    }

    private CompileComponent(srcParent: ParentNode, srcElm: HTMLElement): DOMBuilder {
        srcParent.removeChild(srcElm);

        const {signature, elmTemplate, builders} = this.AnalyseComponent(srcElm);
        const tagName = signature.tagName;

        this.AddConstruct(signature);
        
        // Deze builder bouwt de component-instances op
        const instanceBuilders = [
            this.CompileConstructTemplate(signature, elmTemplate.content, elmTemplate, false)
        ];

        // Deze builder zorgt dat de environment van de huidige component-DEFINITIE bewaard blijft
        return ( 
            async function COMPONENT(this: RCompiler, region: Region) {
                for (const [bldr, srcNode] of builders)
                    await this.CallWithErrorHandling(bldr, srcNode, region);

                // At runtime, we just have to remember the environment that matches the context
                // And keep the previous remembered environment, in case of recursive constructs
                const construct = {instanceBuilders, constructEnv: undefined as Environment};
                const {env} = region;
                const prevDef = env.constructDefs.get(tagName);
                env.constructDefs.set(tagName, construct);
                construct.constructEnv = CloneEnv(env);     // Contains circular reference to construct
                envActions.push(
                    () => { env.constructDefs.set(tagName,  prevDef) }
                );
            } );
    }

    private AnalyseComponent(srcElm: HTMLElement) {

        const builders: [DOMBuilder, ChildNode][] = [];
        let signature: Signature, elmTemplate: HTMLTemplateElement;

        for (const srcChild of Array.from(srcElm.children) as Iterable<HTMLElement>)
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    const builder = this.CompileScript(srcElm, srcChild as HTMLScriptElement);
                    if (builder) builders.push([builder, srcChild]);
                    break;
                case 'STYLE':
                    this.CompileStyle(srcElm, srcChild);
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
        if (!signature) throw `Missing signature`;
        if (!elmTemplate) throw 'Missing <TEMPLATE>';

        return {signature, elmTemplate, builders};
    }

    private CompileConstructTemplate(construct: Signature, contentNode: ParentNode, srcElm: HTMLElement, bNewNames: boolean): ParametrizedBuilder {
        const saved = this.SaveContext();
        const names: string[] = [];
        for (const param of construct.Parameters)
            names.push( bNewNames && GetAttribute(srcElm, param.name, true) || param.name);
        const restParam = construct.RestParam;
        if (restParam )
            names.push( bNewNames && GetAttribute(srcElm, `...${restParam.name}`, true) || restParam.name);
        
        for (const S of construct.Slots.values())
            this.AddConstruct(S);
        try {
            const lvars: LVar[] = names.map(name => this.NewVar(name));
            const builder = this.CompileChildNodes(contentNode);

            return async function(this: RCompiler, region: Region, args: unknown[], mapSlotBuilders, slotEnv) {
                const saved = SaveEnv();
                const env = region.env;
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
                        lvar(region.env)(args[i++]);
                    await builder.call(this, region); 
                }
                finally { RestoreEnv(saved) }}

        }
        catch (err) {throw `${OuterOpenTag(srcElm)} ${err}` }
        finally { this.RestoreContext(saved) }
    }


    private CompileConstructInstance(
        srcParent: ParentNode, srcElm: HTMLElement,
        signature: Signature
    ) {
        srcParent.removeChild(srcElm);
        const tagName = signature.tagName;
        const {preModifiers} = this.CompileAttributes(srcElm);
        const getArgs: Array<Dependent<unknown>> = [];

        for (const {name, pDefault} of signature.Parameters) {
            let pValue: Dependent<unknown> = null;
            getP: {
                let i = 0;
                for (const P of preModifiers) {
                    if (P.name == name) {
                        preModifiers.splice(i, 1);
                        switch(P.modType) {
                            case ModifierType.Attr:
                            case ModifierType.Prop:
                            case ModifierType.Event:
                                pValue = P.depValue; break getP;
                            default:
                                throw `Invalid argument ${srcElm.attributes.item(i).name}`;
                        }
                    }
                    i++;
                }
                if (!pDefault)
                    throw `Missing argument [${name}]`;
                pValue = pDefault;
            }
            getArgs.push(pValue);
        }
        if (!signature.RestParam && preModifiers.length)
            throw `Unknown parameter${preModifiers.length > 1 ? 's': ''}: ${preModifiers.map(m => m.name).join(',')}`

        const slotBuilders = new Map<string, ParametrizedBuilder[]>();
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);

        let slotElm: HTMLElement, Slot: Signature;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE 
                && (Slot = signature.Slots.get(
                    (slotElm = (node as HTMLElement)).tagName
                    ))
            ) {
                slotBuilders.get(slotElm.tagName).push(
                    this.CompileConstructTemplate(Slot, slotElm, slotElm, true)
                );
                srcElm.removeChild(node);
            }
        
        const contentSlot = signature.Slots.get('CONTENT');
        if (contentSlot)
            slotBuilders.get('CONTENT').push(
                this.CompileConstructTemplate(contentSlot, srcElm, srcElm, true)
            );
        this.bTrimLeft = false;

        return async function INSTANCE(this: RCompiler, region: Region) {
            const subregion = PrepareRegion(srcElm, region);
            const localEnv = subregion.env;

            // The construct-template(s) will be executed in this construct-env
            const {instanceBuilders, constructEnv} =  localEnv.constructDefs.get(tagName);

            const savedEnv = SaveEnv();
            try {
                const args: unknown[] = [];
                for ( const getArg of getArgs)
                    args.push(getArg(localEnv));
                
                if (signature.RestParam) {
                    const rest: RestParameter = [];
                    for (const {modType, name, depValue} of preModifiers)
                        rest.push({modType, name, value: depValue(localEnv)})
                    
                    args.push(rest);
                }
                
                const slotEnv = signature.Slots.size ? CloneEnv(localEnv) : null;

                subregion.env = constructEnv
                for (const parBuilder of instanceBuilders) 
                    await parBuilder.call(this, subregion, args, slotBuilders, slotEnv);
            }
            finally { 
                RestoreEnv(savedEnv);
             }
        }
    }

    private CompileHTMLElement(srcElm: HTMLElement) {
        // Remove trailing dots
        const nodeName = srcElm.nodeName.replace(/\.+$/, '');
        const bTrim = /^(BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL)$/.test(nodeName)

        // We turn each given attribute into a modifier on created elements
        const {preModifiers, postModifiers} = this.CompileAttributes(srcElm);

        if (bTrim) this.bTrimLeft = true;
        // Compile the given childnodes into a routine that builds the actual childnodes
        const childnodesBuilder = this.CompileChildNodes(srcElm, bTrim);
        if (bTrim) this.bTrimLeft = true;

        // Now the runtime action
        const builder = async function ELEMENT(this: RCompiler, region: Region) {
            const {parent, start, bInit, env, lastM} = region;
            // Create the element
            let elm: HTMLElement;
            if (!bInit || start == srcElm) {
                region.start = start.nextSibling;
                elm = start as HTMLElement;
                if (elm.tagName != nodeName) {
                    (elm = document.createElement(nodeName)).append(...start.childNodes);
                    parent.replaceChild(elm, start);
                }
                else
                    elm.removeAttribute('class');
            }
            else
                parent.insertBefore(elm = document.createElement(nodeName), start);
            
            if (lastM) {
                lastM.nextM = elm;
                region.lastM = null;
            }

            // Apply all modifiers: adding attributes, classes, styles, events
            for (const {modType, name, depValue} of preModifiers) {
                try {
                    const value = depValue(env);    // Evaluate the dependent value in the current environment
                    // See what to do with it
                    ApplyModifier(elm, modType, name, value)
                }
                catch (err) { throw `[${name}]: ${err}` }
            }
            
            if (!region.bNoChildBuilding)
                // Add all children
                await childnodesBuilder.call(this, {parent: elm, start: elm.firstChild, bInit, env, });

            // Apply all modifiers: adding attributes, classes, styles, events
            for (const mod of postModifiers) {
                const attName = mod.name;
                try {
                    const val = mod.depValue(env);    // Evaluate the dependent value in the current environment
                    // See what to do with it
                    switch (mod.modType) {
                        case ModifierType.PseudoEvent:
                            if (bInit || attName == 'onupdate')
                                (val as ()=>void).call(elm); 
                            break;
                    }
                }
                catch (err) { throw `[${attName}]: ${err}` }
            }

            if (nodeName=='SCRIPT')
                (elm as HTMLScriptElement).text = elm.textContent;
        };

        builder.bTrim = bTrim;
        return builder;
    }

    private CompileAttributes(srcElm: HTMLElement) { 
        const preModifiers: Array<Modifier> = [], postModifiers: Array<Modifier> = [];

        for (const attr of srcElm.attributes) {
            const attrName = attr.name;
            let m: RegExpExecArray;
            try {
                if (m = /^on(create|update)$/i.exec(attrName))
                    postModifiers.push({
                        modType: ModifierType.PseudoEvent, 
                        name: m[0], 
                        depValue: this.CompileExpression<Handler>(
                            `function ${attrName}(){${attr.value}\n}`)
                    });
                if (m = /^on(.*)$/i.exec(attrName))               // Events
                    preModifiers.push({
                        modType: ModifierType.Event, 
                        name: CapitalizeProp(m[0]), 
                        depValue: this.CompileExpression<Handler>(
                            `function ${attrName}(event){${attr.value}\n}`)
                    });
                else if (m = /^#class:(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Class, name: m[1],
                        depValue: this.CompileExpression<boolean>(attr.value)
                    });
                else if (m = /^#style\.(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression<unknown>(attr.value)
                    });
                else if (m = /^style\.(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompileInterpolatedString(attr.value)
                    });
                else if (attrName == '+style')
                    preModifiers.push({
                        modType: ModifierType.AddToStyle, name: null,
                        depValue: this.CompileExpression<object>(attr.value)
                    });
                else if (m = /^#(.*)/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Prop, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression<unknown>(attr.value)
                    });
                else if (attrName == "+class")
                    preModifiers.push({
                        modType: ModifierType.AddToClassList, name: null,
                        depValue: this.CompileExpression<object>(attr.value)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attrName)) { // *, **, @, @@
                    const propName = CapitalizeProp(m[3]);
                    CheckAssignmentTarget(attr.value);
                    const setter = this.CompileExpression<Handler>(
                        `function(){const ORx=this.${propName};if(${attr.value}!==ORx)${attr.value}=ORx}`);
                    if (m[1] == '@')
                        preModifiers.push({ modType: ModifierType.Prop, name: propName, depValue: this.CompileExpression<unknown>(attr.value) });
                    else
                        postModifiers.push({ modType: ModifierType.PseudoEvent, name: 'oncreate', depValue: setter });
                    preModifiers.push({modType: ModifierType.Event, name: m[2] ? 'onchange' : 'oninput', tag: propName, depValue: setter})
                }
                else if (m = /^\.\.\.(.*)/.exec(attrName)) {
                    if (attr.value) throw `Rest parameter cannot have a value`;
                    preModifiers.push({
                        modType: ModifierType.RestArgument, name: null,
                        depValue: this.CompileName(m[1])
                    });
                }
                else
                    preModifiers.push({
                        modType: ModifierType.Attr, name: attrName,
                        depValue: this.CompileInterpolatedString(attr.value)
                    });
            }
            catch (err) {
                throw(`[${attrName}]: ${err}`)
            }
        }
        return {preModifiers, postModifiers};
    }

    private CompileInterpolatedString(data: string, name?: string): Dependent<string> & {isBlank?: boolean} {
        const generators: Array< string | Dependent<unknown> > = [];
        const regIS =
            /(?<![\\$])\$?\{(.*?)(?<!\\)\}|$/gs;
        let isBlank = true;

        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex
            const m = regIS.exec(data);
            const fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;

            if (fixed)
                generators.push( fixed.replace(/\\([${}\\])/g, '$1') );  // Replace '\{' etc by '{'
            if (m[1])
                generators.push( this.CompileExpression<string>(m[1], '{}', null, true) );
            if (m[1] || /[^ \t\r\n]/.test(fixed))
                isBlank = false;
        }

        const dep = (env: Environment) => {
            try {
                let result = "";
                for (const gen of generators)
                    result += 
                        ( typeof gen == 'string' ? gen : gen(env) ?? '');
                return result;
            }
            catch (err) { throw `[${name}]: ${err}` }
        }
        dep.isBlank = isBlank;
        return dep;
    }

    // Compile a 'regular pattern' into a RegExp and a list of bound LVars
    private CompilePattern(patt:string): {lvars: LVar[], regex: RegExp, url?: boolean}
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

    private CompileAttrExpression<T>(elm: HTMLElement, attName: string, bRequired?: boolean) {
        return this.CompileExpression<T>(GetAttribute(elm, attName, bRequired, true));
    }
    private CompileAttribute(elm: HTMLElement, attName: string, bRequired?: boolean): Dependent<unknown> {
        const value = GetAttribute(elm, attName);
        if (value != null)
            return this.CompileInterpolatedString(value);
        return this.CompileAttrExpression(elm, `#${attName}`, bRequired);
    }

    private CompileExpression<T>(
        expr: string,           // Expression to transform into a function
        delims: string = '""'   // Delimiters to put around the expression when encountering a compiletime or runtime error
        , bScript: boolean = false
        , bReturnErrors = false   // true: yield errormessage als result. <T> has to be <string>.
        , name?: string
    ): Dependent<T> {
        if (expr == null) return null;
        // See which names might occur in the expression
        
        const mapNames = new Map<string, void>();
        let regNames = /(?<![A-Za-z0-9_$.'"`])[A-Za-z_$][A-Za-z0-9_$]*/g;
        let m: RegExpExecArray;
        while (m = regNames.exec(expr)) {
            const name = m[0];
            if (this.ContextMap.has(name))
                mapNames.set(name, undefined);
        }
        let patt = '';
        for (const name of this.Context) {
            patt += `${patt ? ',' : ''}${mapNames.has(name) ? '' : '_'}${name}`
        }
        let depExpr = 
            bScript 
            ?  `([${patt}]) => {'use strict';${expr}\n}`  // Braces
            :  `([${patt}]) => (${expr}\n)`;              // Parentheses
        const errorInfo = `${name ? `[${name}] ` : ''}${delims[0]}${Abbreviate(expr,60)}${delims[1]}: `;

        try {
            const routine = globalEval(depExpr) as (env:Environment) => T;
            return (env: Environment) => {
                try {
                    return routine(env);
                } 
                catch (err) { 
                    const message = `${errorInfo}${err}`;
                    if (bReturnErrors && !this.Settings.bAbortOnError) {
                        console.log(message);
                        return (this.Settings.bShowErrors ? message : "") as unknown as T;
                    }
                    else
                        throw message;
                }   // Runtime error
            }
        }
        catch (err) { throw `${errorInfo}${err}` }             // Compiletime error
    }
    private CompileName(name: string): Dependent<unknown> {
        const i = this.ContextMap.get(name);
        if (i === undefined) throw `Unknown name '${name}'`;
        return env => env[i];
    }
}
/*
    start['endNode'] is defined, en is gelijk aan end: de regio is al eerder voorbereid.
        start is dan het al eerder ingevoegde Comment, en moet overgeslagen worden.
    
    Anders moet de regio voorbereid worden door een start- en eind-Comment in te voegen.
    Het start-comment is nodig als vaste markering als de inhoud verandert.
    Het eindcomment is soms nodig opdat de inhoud een vast eindpunt heeft.

    Het kan zijn dat het bron-element er nog staat; dat is dan gelijk aan start.
        De start-markering moet dan geplaatst worden vóór dit bron-element, en de eind-markering er direct ná
    Anders worden zowel start- als eindmarkering vóór 'start' geplaatst.
*/
function PrepareRegion(srcElm: HTMLElement, region: Region, result: unknown = null, bForcedClear: boolean = false, text: string = '')
    : Region & {marker: Comment}
{
    let {parent, start, bInit, lastM} = region;
    let marker: Marker & Comment;
    if (bInit) {
        marker = region.lastM = parent.insertBefore(document.createComment(`${srcElm?.tagName ?? ''} ${text}`), start);
        if (lastM)
            lastM.nextM = marker;
        
        if (start && start == srcElm)
            region.start = start.nextSibling;
    }
    else {
        marker = start as Comment;
        region.start = marker.nextM;
        start = marker.nextSibling;
    }

    if (bInit ||= (bForcedClear || (result != marker.rResult ?? null)) ) {
        marker.rResult = result;
        while (start != region.start) {
            const next = start.nextSibling;
            parent.removeChild(start);
            start = next;
        }
    }
    return {parent, marker, start, bInit, env: region.env};
}

function quoteReg(fixed: string) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}

function CheckAssignmentTarget(target: string) {
    try {
        globalEval(`()=>{${target}=null}`);
    }
    catch(err) { throw `Invalid left-hand side '${target}'`}
}

interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
class _RVAR<T>{
    constructor(
        private rRuntime: RCompiler,
        private name?: string, 
        initialValue?: T, 
        private store?: Store,
        private storeName?: string,
    ) {
        if (name) globalThis[name] = this;
        
        let s: string;
        if ((s = store?.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch{}
        this._Value = initialValue;
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
            this.store?.setItem(`RVAR_${this.storeName}`, JSON.stringify(t));
        }
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { this.SetDirty();  return this._Value }
    set U(t: T) { this.V = t }

    SetDirty() {
        for (const sub of this.Subscribers)
            if (sub.parent.isConnected)
                this.rRuntime.AddDirty(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.RUpdate();
    }
}

function CheckNoAttributesLeft(elm: HTMLElement) {
    let atts: string[] = [];
    for (const {nodeName} of elm.attributes)
        if (!/^_/.test(nodeName))
            atts.push(nodeName);
    
    if (atts.length)
        throw `Unknown attribute${atts.length > 1 ? 's' : ''}: ${atts.join(',')}`;
}

const regIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function CheckValidIdentifier(name: string) {
    // Anders moet het een geldige JavaScript identifier zijn
    name = name.trim();
    if (!regIdentifier.test(name) )
        throw `Invalid identifier '${name}'`;
    if (/^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/.test(name))
        throw `Reserved keyword '${name}'`;

    return name;
}

// Capitalization of property names
// The first character that FOLLOWS on one of these words will be capitalized.
// In this way, we don't have to list all words that occur as property name final words.
const words = '(?:align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
+ '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|margin|max|min|node|offset|outer'
+ '|outline|overflow|owner|padding|parent|right|size|rule|scroll|table|tab(?=index)|text|top|value|variant)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalizeProp(lcName: string) {
    return lcName.replace(regCapitalize, (char) => char.toUpperCase());
}

function GetAttribute(elm: HTMLElement, name: string, bRequired?: boolean, bHashAllowed?: boolean) {
    let value = elm.getAttribute(name);
    if (value==null && bHashAllowed) {
        name = `#${name}`;
        value = elm.getAttribute(name);
    }
    if (value != null)
        elm.attributes.removeNamedItem(name);
    else if (bRequired)
        throw `Missing attribute [${name}]`;
    return value;
}

function OuterOpenTag(elm: HTMLElement, maxLength?: number): string {
    return Abbreviate(/<.*?(?=>)/.exec(elm.outerHTML)[0], maxLength-1) + '>';
}
function Abbreviate(s: string, maxLength: number) {
    if (maxLength && s.length > maxLength)
        return s.substr(0, maxLength - 3) + "...";
    return s;
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

export let RHTML = new RCompiler();

Object.defineProperties(
    globalThis,
    {
        RVAR:       {get: () => RHTML.RVAR.bind(RHTML)},
        RUpdate:    {get: () => RHTML.RUpdate.bind(RHTML)},
    }
);
globalThis.RCompile = RCompile;
export const 
    RVAR = globalThis.RVAR as <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>, 
    RUpdate = globalThis.RUpdate as () => void;

export function* range(from: number, upto?: number, step: number = 1) {
	if (upto === undefined) {
		upto = from;
		from = 0;
	}
	for (let i= from; i<upto; i += step)
		yield i;
}
globalThis.range = range;

export const docLocation: _RVAR<Location> & {subpath?: string} = RVAR<Location>('docLocation', document.location);
function SetDocLocation()  { 
    docLocation.SetDirty();
    if (RootPath)
        docLocation.subpath = document.location.pathname.substr(RootPath.length);
}
window.addEventListener('popstate', SetDocLocation );
export const reroute = globalThis.reroute = (arg: Event | string) => {
    history.pushState(null, null, typeof arg=='string' ? arg : (arg.target as HTMLAnchorElement).href );
    SetDocLocation();
    return false;
}