declare const defaults: {
    bTiming: boolean;
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bSubfile: boolean;
    basePattern: string;
    preformatted: string[];
    bNoGlobals: boolean;
    bDollarRequired: boolean;
    bSetPointer: boolean;
    bKeepWhiteSpace: boolean;
    bKeepComments: boolean;
    storePrefix: string;
};
declare type FullSettings = typeof defaults;
declare type Settings = Partial<FullSettings>;
declare type DOMBuilder = ((ar: Area, ...args: any[]) => Promise<void>) & {
    iB?: boolean | number;
    auto?: string;
    nm?: string;
};
declare type Area = {
    r?: Range;
    parN: Node;
    bfor?: ChildNode;
    srcN?: ChildNode;
    parR?: Range;
    prevR?: Range;
    bR?: boolean;
};
declare class Range<NodeType extends ChildNode = ChildNode> {
    text?: string;
    node: NodeType;
    child: Range;
    nxt: Range;
    parR?: Range;
    parN?: Node;
    constructor(ar: Area, node?: NodeType, text?: string);
    toString(): string;
    get Fst(): ChildNode;
    get Nxt(): ChildNode;
    get FstOrNxt(): ChildNode;
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
export declare function RCompile(srcN?: HTMLElement, settings?: Settings): Promise<void>;
declare type Subscriber<T = unknown> = ((t?: T) => (unknown | Promise<unknown>)) & {
    sAr?: Area;
    bImm?: boolean;
};
declare type Handler = (ev: Event) => any;
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
declare class _RVAR<T = unknown> {
    name?: string;
    constructor(name?: string, init?: T | Promise<T>, store?: Store, storeNm?: string);
    v: T;
    _Subs: Set<Subscriber<T>>;
    Subscribe(s: Subscriber<T>, bImm?: boolean, cr?: boolean): this;
    Unsubscribe(s: Subscriber<T>): void;
    get V(): T;
    set V(t: T);
    get Set(): (t: T | Promise<T>) => T | Promise<T>;
    get Clear(): (_: any) => any;
    get U(): T;
    set U(t: T);
    SetDirty(): void;
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
declare function Subscriber({ parN, bR }: Area, bl: DOMBuilder, r: Range): Subscriber;
export declare function DoUpdate(): Promise<void>;
export declare function RVAR<T>(nm?: string, value?: T | Promise<T>, store?: Store, subs?: (t: T) => void, storeName?: string): RVAR<T>;
interface Key {
}
interface Hash {
}
export declare function RFetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
export declare function range(from: number, count?: number, step?: number): Generator<number, void, unknown>;
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
declare const DL: DocLoc, reroute: (arg: MouseEvent | string) => void;
export { DL as docLocation, reroute };
