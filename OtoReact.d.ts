declare type booly = boolean | string | number | object | null | undefined;
declare type Settings = Partial<{
    bTiming: boolean;
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bSubf: boolean | 2;
    basePattern: string;
    bAutoSubscribe: boolean;
    bAutoPointer: boolean;
    bAutoReroute: boolean;
    bNoGlobals: boolean;
    bDollarRequired: boolean;
    bKeepWhiteSpace: boolean;
    bKeepComments: boolean;
    preformatted: string[];
    storePrefix: string;
    version: number;
    headers: HeadersInit;
}>;
declare type hHTMLElement = HTMLElement & {
    b?: booly;
};
<<<<<<< HEAD
declare type DOMBuilder = ((ar: Area, ...args: any[]) => Promise<void>) & {
    ws?: boolean;
    auto?: boolean;
};
declare type Area = {
    r?: Range;
    parN: Node;
    bfor?: ChildNode;
    srcN?: ChildNode;
    parR?: Range;
    prevR?: Range;
    bROnly?: boolean;
};
declare class Range<NodeType extends ChildNode = ChildNode> {
    text?: string;
    node: NodeType;
    child: Range;
    next: Range;
    parR?: Range;
    parN?: Node;
    constructor(ar: Area, node: NodeType, text?: string);
    toString(): string;
    get First(): ChildNode;
    get Next(): ChildNode;
    get FirstOrNext(): ChildNode;
    Nodes(): Generator<ChildNode>;
    res?: any;
    val?: any;
    errN?: ChildNode;
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
declare type Environment = Array<unknown | ConstructDef>;
declare type FullSettings = typeof defaults;
declare type Settings = Partial<FullSettings>;
export declare function RCompile(elm?: HTMLElement, settings?: Settings): Promise<void>;
declare type Subscriber<T = unknown> = ((t?: T) => (unknown | Promise<unknown>)) & {
    sArea?: Area;
    bImm?: boolean;
    sEnv?: Environment;
};
declare type Handler = (ev: Event) => any;
declare type ConstructDef = {
    nm: string;
    tmplts: Template[];
    CEnv?: Environment;
    Cnm?: string;
};
declare type Template = (ar: Area, args: unknown[], mSlotTemplates: Map<string, Template[]>, cdef: ConstructDef, slotEnv: Environment) => Promise<void>;
=======
export declare function RCompile(srcN: hHTMLElement, setts?: Settings): Promise<void>;
declare type Subscriber<T = unknown> = (((t?: T) => unknown) & {
    T?: never;
}) | (((t: T) => Promise<unknown>) & {
    T: true;
});
>>>>>>> new-Context
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export declare class _RVAR<T = unknown> {
    name?: string;
    constructor(name?: string, init?: T | Promise<T>, store?: Store, storeNm?: string);
    v: T;
    private _Imm;
    _Subs: Set<Subscriber<T>>;
    Subscribe(s: Subscriber<T>, bImm?: boolean, cr?: boolean): this;
    Unsubscribe(s: Subscriber<T>): void;
    get V(): T;
    set V(v: T);
    get Set(): (t: T | Promise<T>) => T | Promise<T>;
    get Clear(): () => any;
    get U(): T;
    set U(t: T);
    SetDirty(): void;
    Exec(): Promise<void>;
    toString(): string;
}
export declare type RVAR<T = unknown> = _RVAR<T>;
export declare type RVAR_Light<T> = T & {
    Subscribe: (sub: Subscriber) => void;
    Exec: () => Promise<void>;
    Save: () => void;
    _Subs: Set<Subscriber>;
    _UpdTo?: Array<RVAR>;
    store?: any;
    readonly U?: T;
    readonly V?: T;
};
<<<<<<< HEAD
declare function Subscriber({ parN, bROnly }: Area, bldr: DOMBuilder, r: Range, arg?: any): Subscriber;
=======
>>>>>>> new-Context
export declare function DoUpdate(): Promise<void>;
export declare function RVAR<T>(nm?: string, value?: T | Promise<T>, store?: Store, subs?: (t: T) => void, storeName?: string): RVAR<T>;
export declare function range(from: number, count?: number, step?: number): Generator<number, void, unknown>;
export declare function RFetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
declare class DocLoc extends _RVAR<string> {
    constructor();
    basepath: string;
    url: URL;
    get subpath(): string;
    set subpath(s: string);
    query: {
        [fld: string]: string;
    };
    search(fld: string, val: string): string;
    RVAR(fld: string, df?: string, nm?: string): RVAR<string>;
}
declare let DL: DocLoc, reroute: (arg: MouseEvent | string) => void;
export { DL as docLocation, reroute };
