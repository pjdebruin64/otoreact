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
export declare function RCompile(elm: HTMLElement, settings?: Settings): RCompiler;
declare type Environment = Array<unknown> & {
    constructDefs: Map<string, ConstructDef>;
};
declare type Marker = ChildNode & {
    nextM?: Marker;
    rResult?: unknown;
    rValue?: unknown;
    hash?: Hash;
    key?: Key;
    keyMap?: Map<Key, Subscriber>;
    errorNode?: Text;
};
declare type Region = {
    parent: Element;
    marker?: Marker;
    start: Marker;
    bInit: boolean;
    env: Environment;
    lastM?: Marker;
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
    parent: Element;
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
    private Context;
    private ContextMap;
    private Constructs;
    AddedHeaderElements: Array<HTMLElement>;
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
    DoUpdate(): Promise<void>;
    RVAR<T>(name?: string, initialValue?: T, store?: Store): _RVAR<T>;
    private RVAR_Light;
    private sourceNodeCount;
    builtNodeCount: number;
    private CompileChildNodes;
    private preMods;
    private CompileElement;
    private CallWithErrorHandling;
    private CompileScript;
    private CompileStyle;
    CompileForeach(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel: boolean): DOMBuilder;
    private ParseSignature;
    private CompileComponent;
    private AnalyseComponent;
    private CompileConstructTemplate;
    private CompileConstructInstance;
    private CompileHTMLElement;
    private CompileAttributes;
    private CompileInterpolatedString;
    private CompilePattern;
    private CompileAttrExpression;
    private CompileAttribute;
    private CompileExpression;
    private CompileName;
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
export declare let RHTML: RCompiler;
export declare const RVAR: <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>, RUpdate: () => void;
export declare function range(from: number, upto?: number, step?: number): Generator<number, void, unknown>;
export declare const docLocation: _RVAR<Location> & {
    subpath?: string;
};
export declare const reroute: (arg: Event | string) => boolean;
export {};
