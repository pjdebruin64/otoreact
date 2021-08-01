declare const defaultSettings: {
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bStripSpaces: boolean;
    bRunScripts: boolean;
    bBuild: boolean;
};
declare type FullSettings = typeof defaultSettings;
declare type Settings = {
    [Property in keyof FullSettings]+?: FullSettings[Property];
};
export declare function RCompile(elm: HTMLElement, settings?: Settings): Promise<RCompiler>;
declare type Environment = Array<unknown> & {
    constructDefs: Map<string, {
        instanceBuilders: ElmBuilder[];
        constructEnv: Environment;
    }>;
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
    lastMarker?: Marker;
};
declare type ElmBuilder = ((this: RCompiler, reg: Region) => void) & {
    bTrim?: boolean;
};
declare type ParentNode = HTMLElement | DocumentFragment;
declare type Subscriber = {
    parent: Element;
    marker: ChildNode;
    env: Environment;
    builder: ElmBuilder;
};
interface Key {
}
interface Hash {
}
declare class RCompiler {
    instanceNum: number;
    private Context;
    private ContextMap;
    private Constructs;
    constructor(clone?: RCompiler);
    private restoreActions;
    private Save;
    private Restore;
    private NewVar;
    private AddConstruct;
    private Tasks;
    Compile(elm: HTMLElement, settings: Settings): Promise<void>;
    Build(reg: Region & {
        marker?: ChildNode;
    }): void;
    Settings: FullSettings;
    ToBuild: Region[];
    private AllRegions;
    private Builder;
    private bTrimLeft;
    private bTrimRight;
    private bCompiled;
    private bHasReacts;
    DirtyRegions: Set<Subscriber>;
    bSomethingDirty: boolean;
    private bUpdating;
    private handleUpdate;
    RUpdate: () => void;
    private DoUpdate;
    RVAR<T>(name?: string, initialValue?: T, store?: Store): _RVAR<T>;
    private RVAR_Light;
    private sourceNodeCount;
    builtNodeCount: number;
    private CompileChildNodes;
    private CompileElement;
    private CallWithErrorHandling;
    private CompileScript;
    private CompileStyle;
    CompileForeach(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, bBlockLevel: boolean): (this: RCompiler, region: Region) => void;
    private ParseSignature;
    private CompileComponent;
    private AnalyseComponent;
    private CreateComponentVars;
    private CompileSlotInstance;
    private CompileConstructTemplate;
    private CompileConstructInstance;
    private CompileHTMLElement;
    private CompileInterpolatedString;
    private CompileAttributeExpression;
    private CompileExpression;
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
export {};
