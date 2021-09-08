declare const defaultSettings: {
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bStripSpaces: boolean;
    bRunScripts: boolean;
    bBuild: boolean;
    rootPattern: string;
};
declare type DOMBuilder = ((reg: Area) => Promise<void>) & {
    bTrim?: boolean;
};
declare type Area = {
    range?: Range;
    parent: Node;
    env: Environment;
    before?: ChildNode;
    source?: ChildNode;
    parentR?: Range;
    prevR?: Range;
    bNoChildBuilding?: boolean;
};
declare class Range<NodeType extends ChildNode = ChildNode> {
    node?: NodeType;
    text?: string;
    child: Range;
    next: Range;
    endMark?: Comment;
    constructor(node?: NodeType, text?: string);
    toString(): string;
    result?: any;
    value?: any;
    errorNode?: ChildNode;
    hash?: Hash;
    key?: Key;
    prev?: Range;
    fragm?: DocumentFragment;
    get First(): ChildNode;
    Nodes(): Generator<ChildNode>;
    get isConnected(): boolean;
}
declare type Environment = Array<unknown> & {
    constructDefs: Map<string, ConstructDef>;
};
declare type FullSettings = typeof defaultSettings;
declare type Settings = Partial<FullSettings>;
export declare function RCompile(elm: HTMLElement, settings?: Settings): Promise<void>;
declare class Subscriber {
    builder: DOMBuilder;
    range: Range;
    parent: Node;
    before: ChildNode;
    env: Environment;
    bNoChildBuilding: boolean;
    constructor(area: Area, builder: DOMBuilder, range: Range);
}
declare type ParentNode = HTMLElement | DocumentFragment;
declare type ConstructDef = {
    instanceBuilders: ParametrizedBuilder[];
    constructEnv: Environment;
};
declare type ParametrizedBuilder = (this: RCompiler, area: Area, args: unknown[], mapSlotBuilders: Map<string, ParametrizedBuilder[]>, slotEnv: Environment) => Promise<void>;
export declare type RVAR_Light<T> = T & {
    _Subscribers?: Array<Subscriber>;
    _UpdatesTo?: Array<_RVAR>;
    Subscribe?: (sub: Subscriber) => void;
    readonly U?: T;
};
interface Key {
}
interface Hash {
}
declare class RCompiler {
    private clone?;
    static iNum: number;
    instanceNum: number;
    private ContextMap;
    private context;
    private Constructs;
    private StyleRoot;
    private StyleBefore;
    private AddedHeaderElements;
    FilePath: string;
    constructor(clone?: RCompiler);
    private get MainC();
    private restoreActions;
    private SaveContext;
    private RestoreContext;
    private NewVar;
    private AddConstruct;
    Compile(elm: ParentNode, settings?: Settings, bIncludeSelf?: boolean): void;
    InitialBuild(area: Area): Promise<void>;
    Settings: FullSettings;
    ToBuild: Area[];
    private AllAreas;
    private Builder;
    private bTrimLeft;
    private bTrimRight;
    private bCompiled;
    private bHasReacts;
    DirtyVars: Set<_RVAR<unknown>>;
    private DirtySubs;
    AddDirty(sub: Subscriber): void;
    private bUpdating;
    private bUpdate;
    private handleUpdate;
    RUpdate(): void;
    private buildStart;
    DoUpdate(): Promise<void>;
    RVAR<T>(name?: string, initialValue?: T, store?: Store): _RVAR<T>;
    private RVAR_Light;
    private sourceNodeCount;
    builtNodeCount: number;
    private CompChildNodes;
    static preMods: string[];
    private CompElement;
    private GetREACT;
    private CallWithErrorHandling;
    private CompScript;
    CompFor(this: RCompiler, srcParent: ParentNode, srcElm: HTMLElement, atts: Atts, bBlockLevel: boolean): DOMBuilder;
    private ParseSignature;
    private CompComponent;
    private CompTemplate;
    private CompInstance;
    static regTrimmable: RegExp;
    private CompHTMLElement;
    private CompAttributes;
    private CompStyle;
    private CompInterpolatedString;
    private CompPattern;
    private CompParameter;
    private CompAttrExpr;
    private CompJavaScript;
    private CompName;
}
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
declare class _RVAR<T = unknown> {
    private MainC;
    private store?;
    private storeName?;
    constructor(MainC: RCompiler, globalName?: string, initialValue?: T, store?: Store, storeName?: string);
    private _Value;
    Subscribers: Set<Subscriber>;
    Subscribe(s: Subscriber): void;
    get V(): T;
    set V(t: T);
    get U(): T;
    set U(t: T);
    SetDirty(): void;
    Save(): void;
}
declare class Atts extends Map<string, string> {
    constructor(elm: HTMLElement);
    get(name: string, bRequired?: boolean, bHashAllowed?: boolean): string;
    CheckNoAttsLeft(): void;
}
export declare let RHTML: RCompiler;
export declare const RVAR: <T>(name?: string, initialValue?: T, store?: Store) => _RVAR<T>, RUpdate: () => void;
declare const _range: (from: number, upto?: number, step?: number) => Generator<number, void, unknown>;
export { _range as range };
export declare const docLocation: _RVAR<Location> & {
    subpath?: string;
};
export declare const reroute: (arg: Event | string) => boolean;
