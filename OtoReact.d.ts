type booly = boolean | string | number | object | null | void;
type ParentNode = HTMLElement | DocumentFragment;
type Handler = (ev: Event) => booly;
type Settings = Partial<{
    bTiming: boolean;
    bAbortOnError: boolean;
    bShowErrors: boolean;
    basePattern: string;
    bAutoPointer: boolean;
    bAutoReroute: boolean;
    bDollarRequired: boolean;
    bKeepWhiteSpace: boolean;
    bKeepComments: boolean;
    preformatted: string[];
    storePrefix: string;
    version: number;
    headers: HeadersInit;
    bSubf: boolean | 2;
}>;
type Environment = [Environment?, ...unknown[]] & {
    cl?: string[];
};
type Area<RT = {}, T = true> = {
    r?: Range & RT | T;
    pN: ParentNode;
    bfor?: ChildNode;
    srcN?: ChildNode;
    pR?: Range;
    prR?: Range;
};
declare class Range<NodeType extends ChildNode = ChildNode> {
    text?: string;
    n: NodeType;
    ch: Range;
    nx: Range;
    pR?: Range;
    pN?: false | Node;
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
        pN: ParentNode;
        pR: Range;
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
    $V: T;
    constructor(t?: T | Promise<T>);
    private $imm;
    $subs: Set<Range<ChildNode> | Subscriber<T>>;
    get V(): T;
    set V(v: T);
    Subscribe(s: Subscriber<T>, bImm?: boolean, cr?: boolean): this;
    Unsubscribe(s: Subscriber<T>): void;
    $SR({ pR, pN }: Area, b: DOMBuilder, r: Range, bR?: boolean): void;
    $UR(r: Range): void;
    get Set(): (t: T | Promise<T>) => void;
    get Clear(): () => true;
    get U(): T;
    set U(t: T);
    SetDirty(prev?: T): void;
    Exec(): Promise<void>;
    valueOf(): Object;
    toString(): string;
}
export type RVAR<T = any, U = T> = RV<T> & U;
export declare function RVAR<T, U = T>(nm?: string, val?: T | Promise<T>, store?: Store, imm?: Subscriber<T>, storeNm?: string, updTo?: RV): RV<T> & U;
type Subscriber<T = unknown> = ((t?: T, prev?: T) => unknown);
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
declare class DL extends RV<URL> {
    query: {
        [fld: string]: string;
    };
    constructor();
    basepath: string;
    get subpath(): string;
    set subpath(s: string);
    search(key: string, val: string): string;
    RVAR(key: string, df?: string, nm?: string): RV<string> & string;
}
export declare const docLocation: DL & URL, reroute: (arg: MouseEvent | string) => void;
export declare function RCompile(srcN: HTMLElement & {
    b?: booly;
}, setts?: string | Settings): Promise<void>;
export declare function DoUpdate(): Promise<void>;
export {};
