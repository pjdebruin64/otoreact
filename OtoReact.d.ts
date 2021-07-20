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
export declare function RCompile(elm: HTMLElement, settings?: Settings): RCompiler;
declare type Environment = Array<unknown>;
declare type Region = {
    parent: Element;
    marker?: ChildNode;
    start: ChildNode;
    bInit: boolean;
    env: Environment;
    lastMarker?: ChildNode;
};
declare type ElmBuilder = (this: RCompiler, reg: Region) => void;
declare type Subscriber = {
    parent: Element;
    marker: ChildNode;
    env: Environment;
    builder: ElmBuilder;
};
declare class RCompiler {
    instanceNum: number;
    private Context;
    private ContextMap;
    private Constructs;
    private HiddenConstructs;
    constructor(clone?: RCompiler);
    private restoreActions;
    private Save;
    private Restore;
    private NewVar;
    private AddConstruct;
    Compile(elm: HTMLElement, settings: Settings): void;
    Build(reg: Region & {
        marker?: ChildNode;
    }): void;
    Settings: FullSettings;
    ToBuild: Region[];
    private AllRegions;
    private Builder;
    private bCompiled;
    private bHasReacts;
    DirtyRegions: Set<Subscriber>;
    bSomethingDirty: boolean;
    private bUpdating;
    private handleUpdate;
    RUpdate: () => void;
    private DoUpdate;
    RVAR: <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>;
    private rvarList;
    setTimeout: any;
    setInterval: any;
    private RVAR_Light;
    private sourceNodeCount;
    builtNodeCount: number;
    private CompileChildNodes;
    private CompileElement;
    private CallWithErrorHandling;
    private CompileScript;
    private CompileForeach;
    private ParseSignature;
    private CompileComponent;
    private CompileConstructTemplate;
    private CompileConstructInstance;
    private CompileRegularElement;
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
    private storage?;
    constructor(rRuntime: RCompiler, name?: string, initialValue?: T, storage?: Store);
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
export declare const RVAR: <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>, RUpdate: () => void, setTimeout: any, setInterval: any;
export declare function range(from: number, upto?: number, step?: number): Generator<number, void, unknown>;
export {};
