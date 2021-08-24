declare const defaultSettings: {
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bStripSpaces: boolean;
    bRunScripts: boolean;
    bBuild: boolean;
    rootPattern: string;
};
declare type FullSettings = typeof defaultSettings;
declare type Settings = {
    [Property in keyof FullSettings]+?: FullSettings[Property];
};
export declare function RCompile(elm: HTMLElement, settings?: Settings): Promise<void>;
declare type Environment = Array<unknown> & {
    constructDefs: Map<string, ConstructDef>;
};
declare type Marker = ChildNode & {
    nextM?: ChildNode;
    rResult?: unknown;
    rValue?: unknown;
    hash?: Hash;
    key?: Key;
    keyMap?: Map<Key, Subscriber>;
    errorNode?: ChildNode;
};
declare type Region = {
    parent: Node;
    marker?: Marker;
    start: ChildNode & {
        errorNode?: ChildNode;
    };
    bInit: boolean;
    env: Environment;
    lastM?: Marker;
    lastSub?: Region;
    bNoChildBuilding?: boolean;
};
declare type DOMBuilder = ((reg: Region) => Promise<void>) & {
    bTrim?: boolean;
};
declare type ConstructDef = {
    instanceBuilders: ParametrizedBuilder[];
    constructEnv: Environment;
};
declare type ParametrizedBuilder = (this: RCompiler, reg: Region, args: unknown[], mapSlotBuilders: Map<string, ParametrizedBuilder[]>, slotEnv: Environment) => Promise<void>;
declare type ParentNode = HTMLElement | DocumentFragment;
declare type Subscriber = {
    parent: Node;
    marker?: ChildNode;
    start?: ChildNode;
    env: Environment;
    builder: DOMBuilder;
} & ({
    marker: ChildNode;
} | {
    start: ChildNode;
});
interface Key {
}
interface Hash {
}
declare class RCompiler {
    instanceNum: number;
    private context;
    private ContextMap;
    private Constructs;
    private StyleRoot;
    private StyleBefore;
    private AddedHeaderElements;
    constructor(clone?: RCompiler);
    private restoreActions;
    private SaveContext;
    private RestoreContext;
    private NewVar;
    private AddConstruct;
    Compile(elm: HTMLElement, settings: Settings, bIncludeSelf: boolean): void;
    Build(reg: Region & {
        marker?: ChildNode;
    }): Promise<void>;
    Settings: FullSettings;
    ToBuild: Region[];
    private AllRegions;
    private Builder;
    private bTrimLeft;
    private bTrimRight;
    private bCompiled;
    private bHasReacts;
    private DirtySubs;
    AddDirty(sub: Subscriber): void;
    private bUpdating;
    private handleUpdate;
    RUpdate(): void;
    private buildStart;
    DoUpdate(): Promise<void>;
    RVAR<T>(name?: string, initialValue?: T, store?: Store): _RVAR<T>;
    private RVAR_Light;
    private sourceNodeCount;
    builtNodeCount: number;
    private CompChildNodes;
    private preMods;
    private CompElement;
    private CallWithErrorHandling;
    private CompScript;
    CompFor(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, atts: Atts, bBlockLevel: boolean): DOMBuilder;
    private ParseSignature;
    private CompComponent;
    private CompConstructTemplate;
    private CompConstructInstance;
    private CompHTMLElement;
    private CompAttributes;
    private CompStyle;
    private CompInterpolatedString;
    private CompPattern;
    private CompParameter;
    private CompAttrExpression;
    private CompJavaScript;
    private CompName;
}
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
declare class _RVAR<T> {
    private rRuntime;
    private name?;
    private store?;
    private storeName?;
    constructor(rRuntime: RCompiler, name?: string, initialValue?: T, store?: Store, storeName?: string);
    private _Value;
    Subscribers: Set<Subscriber>;
    Subscribe(s: Subscriber): void;
    get V(): T;
    set V(t: T);
    get U(): T;
    set U(t: T);
    SetDirty(): void;
}
declare class Atts extends Map<string, string> {
    constructor(elm: HTMLElement);
    get(name: string, bRequired?: boolean, bHashAllowed?: boolean): string;
    CheckNoAttsLeft(): void;
}
export declare let RHTML: RCompiler;
export declare const RVAR: <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>, RUpdate: () => void;
export declare function range(from: number, upto?: number, step?: number): Generator<number, void, unknown>;
export declare const docLocation: _RVAR<Location> & {
    subpath?: string;
};
export declare const reroute: (arg: Event | string) => boolean;
export {};
