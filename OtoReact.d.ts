declare const defaults: {
    bTiming: boolean;
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bRunScripts: boolean;
    basePattern: string;
    preformatted: string[];
    bNoGlobals: boolean;
    bDollarRequired: boolean;
    bSetPointer: boolean;
    bKeepWhiteSpace: boolean;
    bKeepComments: boolean;
    storePrefix: string;
};
declare type booly = boolean | string | number | object;
declare type DOMBuilder = ((area: Area, ...args: any[]) => Promise<void>) & {
    ws?: boolean;
    auto?: boolean;
};
declare type Area = {
    rng?: Range;
    parN: Node;
    bfor?: ChildNode;
    srcN?: ChildNode;
    parR?: Range;
    prevR?: Range;
    bRootOnly?: boolean;
};
declare class Range<NodeType extends ChildNode = ChildNode> {
    text?: string;
    node: NodeType;
    child: Range;
    next: Range;
    parR?: Range;
    parN?: Node;
    constructor(area: Area, node: NodeType, text?: string);
    toString(): string;
    get First(): ChildNode;
    get Next(): ChildNode;
    get FirstOrNext(): ChildNode;
    Nodes(): Generator<ChildNode>;
    res?: any;
    val?: any;
    errNode?: ChildNode;
    bfDest?: Handler;
    onDest?: Handler;
    hash?: Hash;
    key?: Key;
    prev?: Range;
    fragm?: DocumentFragment;
    updated?: number;
    subs?: Subscriber;
    rvars?: RVAR[];
    wins?: Set<Window>;
    erase(par: Node): void;
}
declare type Environment = Array<any> & {
    C: Array<ConstructDef>;
};
declare type FullSettings = typeof defaults;
declare type Settings = Partial<FullSettings>;
export declare function RCompile(elm?: HTMLElement, settings?: Settings): Promise<void>;
declare type Subscriber<T = unknown> = ((t?: T) => (void | Promise<void>)) & {
    sArea?: Area;
    bImm?: boolean;
    env?: Environment;
};
declare type ParentNode = HTMLElement | DocumentFragment;
declare type Handler = (ev: Event) => any;
declare type ConstructDef = {
    nm: string;
    templates: Template[];
    CEnv?: Environment;
    Cnm?: string;
};
declare type Template = (area: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, slotEnv: Environment) => Promise<void>;
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
declare class _RVAR<T = unknown> {
    name?: string;
    store?: Store;
    private storeName?;
    constructor(name?: string, initial?: T | Promise<T>, store?: Store, storeName?: string);
    private _val;
    _Subs: Set<Subscriber<T>>;
    auto: Subscriber;
    private get _sNm();
    Subscribe(s: Subscriber<T>, bImmediate?: boolean, bCr?: boolean): this;
    Unsubscribe(s: Subscriber<T>): void;
    get V(): T;
    set V(t: T);
    _Set(t: T | Promise<T>): T | Promise<T>;
    get Set(): any;
    get Clear(): () => any;
    get U(): T;
    set U(t: T);
    SetDirty(): void;
    Save(): void;
    toString(): string;
}
export declare type RVAR<T = unknown> = _RVAR<T>;
export declare type RVAR_Light<T> = T & {
    _Subs: Set<Subscriber>;
    _UpdTo?: Array<RVAR>;
    Subscribe?: (sub: Subscriber) => void;
    store?: any;
    Save?: () => void;
    readonly U?: T;
};
declare function Subscriber({ parN, bRootOnly }: Area, builder: DOMBuilder, rng: Range, ...args: any[]): Subscriber;
export declare function DoUpdate(): Promise<void>;
export declare function RVAR<T>(nm?: string, value?: T | Promise<T>, store?: Store, subs?: (t: T) => void, storeName?: string): RVAR<T>;
interface Key {
}
interface Hash {
}
declare class RCompiler {
    static iNum: number;
    num: number;
    private ctStr;
    private ctMap;
    private ctLen;
    private ctSigns;
    private ctCCnt;
    private cRvars;
    private doc;
    private head;
    private StyleBefore;
    FilePath: string;
    constructor(RC?: RCompiler, FilePath?: string, bClr?: boolean);
    private restoreActions;
    private SaveCont;
    private RestoreCont;
    private newV;
    private NewVars;
    private NewConstructs;
    Compile(elm: ParentNode, settings?: Settings, childnodes?: Iterable<ChildNode>): Promise<void>;
    logTime(msg: string): void;
    private setPRE;
    Build(area: Area): Promise<void>;
    Settings: FullSettings;
    private Builder;
    bCompiled: boolean;
    private wspc;
    private rspc;
    private srcNodeCnt;
    private CompChildNodes;
    private CompIter;
    private CompElm;
    private GetREACT;
    private CallWithHandling;
    private CompScript;
    CompFor(this: RCompiler, srcElm: HTMLElement, atts: Atts): Promise<DOMBuilder>;
    private ParseSignat;
    private CompComponent;
    private CompTempl;
    private CompInstance;
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
    fetchModule(src: string): Promise<Iterable<ChildNode>>;
}
export declare function RFetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
declare class Atts extends Map<string, string> {
    constructor(elm: HTMLElement);
    g(nm: string, bReq?: booly, bHashAllowed?: booly): string;
    gB(nm: string): boolean;
    ChkNoAttsLeft(): void;
}
export declare function range(from: number, count?: number, step?: number): Generator<number, void, unknown>;
export declare let R: RCompiler, docLocation: RVAR<string> & {
    basepath: string;
    subpath: string;
    searchParams: URLSearchParams;
    search(key: string, value: string): string;
    getSearch(key: string): string;
    setSearch(key: string, value: string): void;
    RVAR(key: string, ini?: string, varNm?: string): RVAR<string>;
}, reroute: (arg: MouseEvent | string) => void;
export {};
