declare type booly = boolean | string | number | object;
declare type Settings = Partial<{
    bTiming: boolean;
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bSubfile: boolean;
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
declare type DOMBuilder<RT = unknown> = ((ar: Area, bR?: boolean) => Promise<RT>) & {
    auto?: string;
    nm?: string;
};
declare type Area<VT = unknown> = {
    r?: Range<ChildNode, VT> | true;
    parN: ParentNode;
    bfor?: ChildNode;
    srcN?: HTMLElement;
    parR?: Range;
    prvR?: Range;
};
declare class Range<NodeType extends ChildNode = ChildNode, VT = unknown> {
    text?: string;
    node: NodeType;
    ch: Range;
    nx: Range;
    parR?: Range;
    parN?: Node;
    constructor(ar: Area, node?: NodeType, text?: string);
    toString(): string;
    get Fst(): ChildNode;
    get Nxt(): ChildNode;
    get FstOrNxt(): ChildNode;
    Nodes(): Generator<ChildNode>;
    res?: any;
    val?: VT;
    errN?: ChildNode;
    bfD?: Handler;
    afD?: Handler;
    upd?: number;
    subs?: Subscriber;
    rvars?: RVAR[];
    erase(par: Node): void;
}
export declare function RCompile(srcN: hHTMLElement, setts?: Settings): Promise<void>;
declare type Subscriber<T = unknown> = (((t?: T) => unknown) & {
    ar?: never;
}) | (((t: T) => Promise<unknown>) & {
    ar: Area;
});
declare type ParentNode = HTMLElement | DocumentFragment;
declare type Handler = (ev: Event) => any;
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export declare class _RVAR<T = unknown> {
    name?: string;
    constructor(name?: string, init?: T | Promise<T>, store?: Store, storeNm?: string);
    v: T;
    _Imm: Set<Subscriber<T>>;
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
declare function Subscriber({ parN, parR }: Area, b: DOMBuilder, r: Range, bR?: boolean): Subscriber;
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
