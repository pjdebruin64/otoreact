type booly = boolean | string | number | object | null | void;
type ParentNode = HTMLElement | DocumentFragment;
type Handler = (ev: Event) => booly;
type Settings = Partial<{
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
    bAR: boolean;
}>;
type Environment = [Environment?, ...unknown[]] & {
    cl?: string[];
};
type Area<RT = {}, T = true> = {
    r?: Range & RT | T;
    parN: ParentNode;
    bfor?: ChildNode;
    srcN?: ChildNode;
    parR?: Range;
    prR?: Range;
};
declare class Range<NodeType extends ChildNode = ChildNode> {
    text?: string;
    n: NodeType;
    ch: Range;
    nx: Range;
    parR?: Range;
    parN?: false | Node;
    constructor(ar: Area, n?: NodeType, text?: string);
    toString(): string;
    get Fst(): ChildNode;
    get Nxt(): ChildNode;
    get FstOrNxt(): ChildNode;
    Nodes(): Generator<ChildNode>;
    bD?: Handler;
    aD?: Handler;
    upd?: number;
    rvars?: Set<RV>;
    erase(par: false | Node): void;
    uInfo?: {
        b: DOMBuilder;
        env: Environment;
        oes: OES;
        pn: ParentNode;
        parR: Range;
        bR: boolean;
    };
    update(): Promise<void>;
}
export interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export declare class RVA<T = unknown> {
    name?: string;
    constructor(name?: string, init?: T | Promise<T>, store?: Store, storeNm?: string);
    _v: T;
    private _Imm;
    _Subs: Set<Range<ChildNode> | Subscriber<T>>;
    _UpdTo?: Array<RV>;
    get V(): T;
    set V(v: T);
    get v(): T;
    Subscribe(s: Subscriber<T>, bImm?: boolean, cr?: boolean): this;
    Unsubscribe(s: Subscriber<T>): void;
    $SR({ parR, parN }: Area, b: DOMBuilder, r: Range, bR?: boolean): void;
    $UR(r: Range): void;
    get Set(): (t: T | Promise<T>) => void;
    get Clear(): () => true;
    get U(): T;
    set U(t: T);
    SetDirty(): void;
    Exec(): Promise<void>;
    toString(): string;
}
export type RVAR<T = unknown> = RVA<T>;
type RV = {
    Subscribe: (sub: Subscriber) => void;
    $SR: (ar: Area, b: DOMBuilder, r: Range, bR?: boolean) => void;
    $UR: (r: Range) => void;
    Exec: () => Promise<void>;
    SetDirty: () => void;
    _Subs: Set<Subscriber | Range>;
    _UpdTo?: Array<RV>;
};
export type ROBJ<T> = T & RV & {
    _v: T;
    Save: () => void;
    store?: any;
    readonly U?: T;
};
export declare function RVAR<T>(nm?: string, value?: T | Promise<T>, store?: Store, subs?: (t: T) => void, storeName?: string): RVAR<T>;
type Subscriber<T = unknown> = ((t?: T) => unknown);
type OES = {
    e: Handler;
    s: Handler;
};
type DOMBuilder<RT = void | boolean> = ((ar: Area, bR?: boolean) => Promise<RT>) & {
    auto?: string;
    nm?: string;
};
export declare function range(from: number, count?: number, step?: number): Generator<number, void, unknown>;
export declare function RFetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
declare class DocLoc extends RVA<string> {
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
export declare function RCompile(srcN: HTMLElement & {
    b?: booly;
}, setts?: string | Settings): Promise<void>;
export declare function DoUpdate(): Promise<void>;
