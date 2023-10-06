type booly = boolean | string | number | object | null | undefined;
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
}>;
type hHTMLElement = HTMLElement & {
    b?: booly;
};
export declare function RCompile(srcN: hHTMLElement, setts?: Settings): Promise<void>;
type Subscriber<T = unknown> = (((t?: T) => unknown) & {
    T?: never;
}) | (((t: T) => Promise<unknown>) & {
    T: true;
});
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
    get Clear(): () => true;
    get U(): T;
    set U(t: T);
    SetDirty(): void;
    Exec(): Promise<void>;
    toString(): string;
}
export type RVAR<T = unknown> = _RVAR<T>;
export type RVAR_Light<T> = T & {
    Subscribe: (sub: Subscriber) => void;
    Exec: () => Promise<void>;
    Save: () => void;
    _Subs: Set<Subscriber>;
    _UpdTo?: Array<RVAR>;
    store?: any;
    readonly U?: T;
    readonly V?: T;
};
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
