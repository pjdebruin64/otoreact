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
declare type Context = Array<string>;
declare type Environment = Array<unknown>;
declare type Dependent<T> = (env: Environment) => T;
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
declare type Parameter = {
    pid: string;
    pdefault: Dependent<unknown>;
};
declare class Component {
    TagName: string;
    Parameters: Array<Parameter>;
    Slots: Array<Component>;
    constructor(TagName: string, Parameters?: Array<Parameter>, Slots?: Array<Component>);
    Builders: ElmBuilder[];
    ComponentEnv: Environment;
}
declare class RCompiler {
    private Context;
    private Components;
    instanceNum: number;
    constructor(Context?: Context, Components?: Component[]);
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
    private CompileComponentInstance;
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
export declare let RVAR: <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>;
export declare let RUpdate: () => void;
export declare function range(from: number, upto?: number, step?: number): Generator<number, void, unknown>;
export {};
