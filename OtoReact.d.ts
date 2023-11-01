type booly = boolean | string | number | object | null | void;
type ParentNode = HTMLElement | DocumentFragment;
type Handler = (ev: Event) => booly;
type Settings = Partial<{
    bTiming: boolean;
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bSubf: boolean | 2;
    basePattern: string;
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
export declare class RV<T = unknown> {
    $name?: string;
    $name?: string;
    _v: T;
    constructor(t?: T | Promise<T>);
    private $imm;
    $subs: Set<Range<ChildNode> | Subscriber<T>>;
    $upd: Array<RV>;
    get V(): T;
    set V(v: T);
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
    valueOf(): Object | "";
}
export type RVAR<T = unknown> = RV<T>;
export type ROBJ<T extends object> = RV<T> & T;
export declare function RVAR<T>(nm?: string, val?: T | Promise<T>, store?: Store, subs?: (t: T) => void, storeNm?: string, updTo?: RV): RVAR<T>;
export type ROBJ<T extends object> = RV<T> & T;
export declare function RVAR<T>(nm?: string, val?: T | Promise<T>, store?: Store, subs?: (t: T) => void, storeNm?: string, updTo?: RV): RVAR<T>;
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
declare class DocLoc extends RV<string> {
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
