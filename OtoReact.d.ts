declare let defaultSettings: {
    bTiming: boolean;
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bRunScripts: boolean;
    basePattern: string;
    preformatted: any[];
    bNoGlobals: boolean;
    bDollarRequired: boolean;
    bSetPointer: boolean;
    bKeepWhiteSpace: boolean;
    bKeepComments: boolean;
};
declare type bool = boolean | string | number | object;
declare type DOMBuilder = ((reg: Area) => Promise<void>) & {
    ws?: bool;
    auto?: bool;
};
declare type Area = {
    rng?: Range;
    parent: Node;
    before?: ChildNode;
    source?: ChildNode;
    parentR?: Range;
    prevR?: Range;
    bRootOnly?: bool;
};
declare class Range<NodeType extends ChildNode = ChildNode> {
    node: NodeType;
    text?: string;
    child: Range;
    next: Range;
    parentR?: Range;
    newParent?: Node;
    constructor(node: NodeType, area: Area, text?: string);
    toString(): string;
    result?: any;
    value?: any;
    errorNode?: ChildNode;
    onDest?: Handler;
    hash?: Hash;
    key?: Key;
    prev?: Range;
    fragm?: DocumentFragment;
    rvar?: RVAR_Light<Item>;
    iSub?: Subscriber<Item>;
    updated?: number;
    subs?: Subscriber;
    rvars?: RVAR[];
    wins?: Window[];
    get First(): ChildNode;
    get Next(): ChildNode;
    get FirstOrNext(): ChildNode;
    Nodes(): Generator<ChildNode>;
    erase(parent: Node): void;
}
declare type Environment = Array<unknown> & {
    constructs: Map<string, ConstructDef>;
};
declare type FullSettings = typeof defaultSettings;
declare type Settings = Partial<FullSettings>;
export declare function RCompile(elm: HTMLElement, settings?: Settings): Promise<void>;
declare type Subscriber<T = unknown> = ((t?: T) => (void | Promise<void>)) & {
    ref?: {};
    sArea?: Area;
    bImm?: bool;
    env?: Environment;
};
declare type ParentNode = HTMLElement | DocumentFragment;
declare type Handler = (ev: Event) => any;
declare type ConstructDef = {
    nm: string;
    templates: Template[];
    CEnv?: Environment;
};
declare type Template = (this: RCompiler, area: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment) => Promise<void>;
export declare type RVAR_Light<T> = T & {
    _Subscribers: Set<Subscriber>;
    _UpdatesTo?: Array<RVAR>;
    Subscribe?: (sub: Subscriber) => void;
    store?: any;
    Save?: () => void;
    readonly U?: T;
};
interface Item {
}
interface Key {
}
interface Hash {
}
declare class RCompiler {
    static iNum: number;
    num: number;
    private RC;
    private ContextMap;
    private context;
    private CSignatures;
    private cRvars;
    private head;
    private StyleBefore;
    FilePath: string;
    RootElm: ParentNode;
    constructor(RC?: RCompiler, bClr?: bool);
    private restoreActions;
    private SaveCont;
    private RestoreCont;
    private NewV;
    private SetVar;
    private NewVars;
    private AddConstructs;
    Compile(elm: ParentNode, settings?: Settings, childnodes?: Iterable<ChildNode>): Promise<void>;
    logTime(msg: string): void;
    private mPreformatted;
    Subscriber({ parent, bRootOnly }: Area, builder: DOMBuilder, rng: Range, ...args: any[]): Subscriber;
    Build(area: Area): Promise<void>;
    Settings: FullSettings;
    private Builder;
    private bCompiled;
    private wspc;
    private rspc;
    DirtyVars: Set<{
        _Subscribers: Set<Subscriber>;
        store?: any;
        Save?: () => void;
    }>;
    private bUpdating;
    private hUpdate;
    RUpdate(): void;
    start: number;
    DoUpdate(): Promise<void>;
    RVAR<T>(nm?: string, value?: T | Promise<T>, store?: Store, subs?: (t: T) => void, storeName?: string): _RVAR<T>;
    private RVAR_Light;
    private sourceNodeCount;
    private CompChildNodes;
    private CompIter;
    static genAtts: RegExp;
    private CompElm;
    private GetREACT;
    private CallWithHandling;
    private CompScript;
    CompFor(this: RCompiler, srcElm: HTMLElement, atts: Atts): Promise<DOMBuilder>;
    private CompDefine;
    private ParseSignat;
    private CompComponent;
    private CompTemplate;
    private CompInstance;
    static regBlock: RegExp;
    static regInline: RegExp;
    private CompHTMLElement;
    private CompAttribs;
    private CompStyle;
    private regIS;
    private CompString;
    private CompPattern;
    private CompParam;
    private CompAttrExpr;
    private CompHandler;
    private CompJScript;
    private CompName;
    private compAttrExprList;
    private AddErrH;
    private GetURL;
    private GetPath;
    FetchText(src: string): Promise<string>;
    fetchModule(src: string, bInclHead?: bool): Promise<Iterable<ChildNode>>;
}
export declare function RFetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
declare class _RVAR<T = unknown> {
    private RC;
    name?: string;
    store?: Store;
    private storeName?;
    constructor(RC: RCompiler, name?: string, initialValue?: T | Promise<T>, store?: Store, storeName?: string);
    private _val;
    _Subscribers: Set<Subscriber<T>>;
    auto: Subscriber;
    private get _sNm();
    Subscribe(s: Subscriber<T>, bImmediate?: bool, bInit?: bool): void;
    Unsubscribe(s: Subscriber<T>): void;
    get V(): T;
    set V(t: T);
    _Set(t: T | Promise<T>): T | Promise<T>;
    get Set(): any;
    get Clear(): () => void;
    get U(): T;
    set U(t: T);
    SetDirty(): void;
    Save(): void;
}
export interface RVAR<T = unknown> extends _RVAR<T> {
}
declare class Atts extends Map<string, string> {
    constructor(elm: HTMLElement);
    get(nm: string, bRequired?: bool, bHashAllowed?: bool): string;
    getB(nm: string): boolean;
    ChkNoAttsLeft(): void;
}
declare let _rng: (from: number, count?: number, step?: number) => Generator<number, void, unknown>;
export declare let R: RCompiler, RVAR: <T>(name?: string, initialValue?: T | Promise<T>, store?: Store, subs?: Subscriber, storeName?: string) => RVAR<T>, RUpdate: () => void, docLocation: RVAR<string> & {
    basepath: string;
    subpath: string;
    searchParams: URLSearchParams;
    search: (key: string, value: string) => void;
}, reroute: (arg: MouseEvent | string) => void;
export { _rng as range };
