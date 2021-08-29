const defaultSettings = {
    bAbortOnError: false,
    bShowErrors: true,
    bStripSpaces: true,
    bRunScripts: false,
    bBuild: true,
    rootPattern: null,
};
class Range {
    node;
    text;
    child;
    next = null;
    constructor(node, text) {
        this.node = node;
        this.text = text;
        if (!node)
            this.child = null;
    }
    toString() { return this.text || this.node?.nodeName; }
    rResult;
    errorNode;
    previous;
    hash;
    key;
    get First() {
        let f;
        if (f = this.node)
            return f;
        let child = this.child;
        while (child) {
            if (f = child.First)
                return f;
            child = child.next;
        }
        return null;
    }
    get isConnected() {
        const f = this.First;
        return f && f.isConnected;
    }
    ChildNodes() {
        return (function* ChildNodes(r) {
            if (r.node)
                yield r.node;
            let child = r.child;
            while (child) {
                ChildNodes(child);
                child = child.next;
            }
        })(this);
    }
}
function PrepareArea(srcElm, area, text = '') {
    let { parent, range, bInit, env } = area;
    let subRange;
    if (bInit) {
        subRange = new Range(null, `${srcElm ? srcElm.tagName : ''} ${text}`);
        UpdatePrevArea(area, subRange);
    }
    else
        subRange = range.child;
    return { parent, range: subRange, bInit, env, parentR: range, };
}
function UpdatePrevArea(area, range) {
    let r;
    if (r = area.parentR) {
        r.child = range;
        area.parentR = null;
    }
    else if (r = area.prevR)
        r.next = range;
    area.prevR = range;
}
function PrepareElement(srcElm, area, nodeName = srcElm.nodeName) {
    let range;
    if (area.bInit) {
        const elm = (area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore(document.createElement(nodeName), area.before));
        range = new Range(elm);
        UpdatePrevArea(area, range);
    }
    else {
        range = area.range;
        area.range = range.next;
    }
    return range;
}
function ClearRange(area, bForced, result = null) {
    const { range } = area;
    if (bForced || result != range.rResult) {
        range.rResult = result;
        for (const node of range.ChildNodes())
            area.parent.removeChild(node);
        range.child = null;
        area.bInit = true;
    }
}
let RootPath = null;
export function RCompile(elm, settings) {
    try {
        const { rootPattern } = settings = { ...defaultSettings, ...settings };
        if (rootPattern) {
            const url = document.location.href;
            const m = url.match(`^.*(${rootPattern})`);
            if (!m)
                throw `Root pattern '${rootPattern}' does not match URL '${url}'`;
            RootPath = (new URL(m[0])).pathname;
        }
        else
            RootPath = `${document.location.origin}${document.location.pathname}`;
        globalThis.RootPath = RootPath;
        SetDocLocation();
        const R = RHTML;
        R.Compile(elm, settings, true);
        R.ToBuild.push({ bInit: true, parent: elm.parentElement, env: NewEnv(), source: elm, range: null });
        return (R.Settings.bBuild
            ? R.DoUpdate().then(() => { elm.hidden = false; })
            : null);
    }
    catch (err) {
        window.alert(`Re-Act error: ${err}`);
    }
}
function NewEnv() {
    const env = [];
    env.constructDefs = new Map();
    return env;
}
function CloneEnv(env) {
    const clone = env.slice();
    clone.constructDefs = new Map(env.constructDefs.entries());
    return clone;
}
class Subscriber {
    builder;
    parent;
    range;
    env;
    bNoChildBuilding;
    constructor(area, builder) {
        this.builder = builder;
        this.parent = area.parent;
        this.range = area.prevR;
        this.env = area.env && CloneEnv(area.env);
        this.bNoChildBuilding = area.bNoChildBuilding;
    }
}
;
class Signature {
    srcElm;
    constructor(srcElm) {
        this.srcElm = srcElm;
        this.tagName = srcElm.tagName;
    }
    tagName;
    Parameters = [];
    RestParam = null;
    Slots = new Map();
    IsCompatible(sig) {
        let result = sig
            && this.tagName == sig.tagName
            && this.Parameters.length <= sig.Parameters.length;
        const iter = sig.Parameters.values();
        for (const thisParam of this.Parameters) {
            const sigParam = iter.next().value;
            result &&= thisParam.name == sigParam.name && (!thisParam.pDefault || !!sigParam.pDefault);
        }
        result &&= !this.RestParam || this.RestParam.name == sig.RestParam?.name;
        for (let [slotname, slotSig] of this.Slots)
            result &&= slotSig.IsCompatible(sig.Slots.get(slotname));
        return result;
    }
}
const globalEval = eval;
;
;
;
var ModifType;
(function (ModifType) {
    ModifType[ModifType["Attr"] = 0] = "Attr";
    ModifType[ModifType["Prop"] = 1] = "Prop";
    ModifType[ModifType["Class"] = 2] = "Class";
    ModifType[ModifType["Style"] = 3] = "Style";
    ModifType[ModifType["Event"] = 4] = "Event";
    ModifType[ModifType["AddToStyle"] = 5] = "AddToStyle";
    ModifType[ModifType["AddToClassList"] = 6] = "AddToClassList";
    ModifType[ModifType["RestArgument"] = 7] = "RestArgument";
    ModifType[ModifType["oncreate"] = 8] = "oncreate";
    ModifType[ModifType["onupdate"] = 9] = "onupdate";
})(ModifType || (ModifType = {}));
;
function ApplyModifier(elm, modType, name, val, bInit) {
    switch (modType) {
        case ModifType.Attr:
            elm.setAttribute(name, val || '');
            break;
        case ModifType.Prop:
            if (val != null)
                elm[name] = val;
            else
                delete elm[name];
            break;
        case ModifType.Event:
            if (val)
                elm[name] = val;
            break;
        case ModifType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModifType.Style:
            if (val !== undefined)
                elm.style[name] = val || '';
            break;
        case ModifType.AddToStyle:
            if (val)
                Object.assign(elm.style, val);
            break;
        case ModifType.AddToClassList:
            if (Array.isArray(val))
                for (const className of val)
                    elm.classList.add(className);
            else
                for (const [className, bln] of Object.entries(val))
                    if (bln)
                        elm.classList.add(className);
            break;
        case ModifType.RestArgument:
            for (const { modType, name, value } of val)
                ApplyModifier(elm, modType, name, value, bInit);
            break;
        case ModifType.oncreate:
            if (bInit)
                val.call(elm);
            break;
        case ModifType.onupdate:
            val.call(elm);
            break;
    }
}
function ApplyModifiers(elm, modifiers, { env, bInit }) {
    for (const { modType, name, depValue } of modifiers) {
        try {
            const value = depValue.bUsesThis ? depValue.call(elm, env) : depValue(env);
            ApplyModifier(elm, modType, name, value, bInit);
        }
        catch (err) {
            throw `[${name}]: ${err}`;
        }
    }
}
const Modules = new Map();
const envActions = [];
function SaveEnv() {
    return envActions.length;
}
function RestoreEnv(savedEnv) {
    for (let j = envActions.length; j > savedEnv; j--)
        envActions.pop()();
}
class RCompiler {
    static iNum = 0;
    instanceNum = RCompiler.iNum++;
    ContextMap;
    context;
    Constructs;
    StyleRoot;
    StyleBefore;
    AddedHeaderElements;
    constructor(clone) {
        this.context = clone ? clone.context : "";
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings = clone ? { ...clone.Settings } : { ...defaultSettings };
        this.AddedHeaderElements = clone ? clone.AddedHeaderElements : [];
        this.StyleRoot = clone ? clone.StyleRoot : document.head;
        this.StyleBefore = clone?.StyleBefore;
    }
    restoreActions = [];
    SaveContext() {
        return this.restoreActions.length;
    }
    RestoreContext(savedContext) {
        for (let j = this.restoreActions.length; j > savedContext; j--)
            this.restoreActions.pop()();
    }
    NewVar(name) {
        if (!name)
            return (_) => (_) => { };
        name = CheckValidIdentifier(name);
        let i = this.ContextMap.get(name);
        const bNewName = i == null;
        if (bNewName) {
            const savedContext = this.context;
            i = this.ContextMap.size;
            this.ContextMap.set(name, i);
            this.context += `${name},`;
            this.restoreActions.push(() => {
                this.ContextMap.delete(name);
                this.context = savedContext;
            });
        }
        return function InitVar(env) {
            const prev = env[i], j = i;
            envActions.push(() => { env[j] = prev; });
            return (value) => { env[j] = value; };
        }.bind(this);
    }
    AddConstruct(C) {
        const CName = C.tagName;
        const savedConstr = this.Constructs.get(CName);
        this.Constructs.set(CName, C);
        this.restoreActions.push(() => this.Constructs.set(CName, savedConstr));
    }
    Compile(elm, settings, bIncludeSelf) {
        this.Settings = { ...defaultSettings, ...settings, };
        const t0 = performance.now();
        const savedR = RHTML;
        RHTML = this;
        if (bIncludeSelf)
            this.Builder = this.CompElement(elm.parentElement, elm)[0];
        else
            this.Builder = this.CompChildNodes(elm);
        this.bCompiled = true;
        RHTML = savedR;
        const t1 = performance.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${(t1 - t0).toFixed(1)} ms`);
    }
    async Build(area) {
        const savedRCompiler = RHTML;
        RHTML = this;
        await this.Builder(area);
        this.AllAreas.push(new Subscriber(area, this.Builder));
        RHTML = savedRCompiler;
    }
    Settings;
    ToBuild = [];
    AllAreas = [];
    Builder;
    bTrimLeft = false;
    bTrimRight = false;
    bCompiled = false;
    bHasReacts = false;
    DirtyVars = new Set();
    DirtySubs = new Map();
    AddDirty(sub) {
        this.DirtySubs.set(sub.range, sub);
    }
    bUpdating = false;
    handleUpdate = null;
    RUpdate() {
        if (!this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 0);
    }
    ;
    buildStart;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        this.bUpdating = true;
        let savedRCompiler = RHTML;
        try {
            if (this.ToBuild.length) {
                this.buildStart = performance.now();
                this.builtNodeCount = 0;
                for (const area of this.ToBuild)
                    await this.Build(area);
                console.log(`Built ${this.builtNodeCount} nodes in ${(performance.now() - this.buildStart).toFixed(1)} ms`);
                this.ToBuild = [];
            }
            if (!this.bHasReacts)
                for (const s of this.AllAreas)
                    this.AddDirty(s);
            for (const rvar of this.DirtyVars)
                rvar.Save();
            this.DirtyVars.clear();
            if (this.DirtySubs.size) {
                RHTML = this;
                this.buildStart = performance.now();
                this.builtNodeCount = 0;
                for (const { range, builder, parent, env, bNoChildBuilding } of this.DirtySubs.values()) {
                    try {
                        await builder.call(this, { range, parent, env, bInit: false, bNoChildBuilding });
                    }
                    catch (err) {
                        const msg = `ERROR: ${err}`;
                        console.log(msg);
                        window.alert(msg);
                    }
                }
                console.log(`Updated ${this.builtNodeCount} nodes in ${(performance.now() - this.buildStart).toFixed(1)} ms`);
            }
        }
        finally {
            this.DirtySubs.clear();
            RHTML = savedRCompiler;
            this.bUpdating = false;
        }
    }
    RVAR(name, initialValue, store) {
        return new _RVAR(this, name, initialValue, store, name);
    }
    ;
    RVAR_Light(t, updatesTo = []) {
        if (!t._Subscribers) {
            t._Subscribers = [];
            t._UpdatesTo = updatesTo;
            const R = this;
            Object.defineProperty(t, 'U', { get: function () {
                    for (const sub of t._Subscribers)
                        R.AddDirty(sub);
                    if (t._UpdatesTo.length)
                        for (const rvar of t._UpdatesTo)
                            rvar.SetDirty();
                    else
                        R.RUpdate();
                    return t;
                }
            });
            t.Subscribe = function (sub) { t._Subscribers.push(sub); };
        }
        return t;
    }
    sourceNodeCount = 0;
    builtNodeCount = 0;
    CompChildNodes(srcParent, bBlockLevel, childNodes = Array.from(srcParent.childNodes), bNorestore) {
        const builders = [];
        const saved = this.SaveContext();
        this.sourceNodeCount += childNodes.length;
        try {
            for (const srcNode of childNodes) {
                switch (srcNode.nodeType) {
                    case Node.ELEMENT_NODE:
                        const builderElm = this.CompElement(srcParent, srcNode, bBlockLevel);
                        if (builderElm) {
                            builders.push(builderElm);
                            if (builderElm[0].bTrim) {
                                let i = builders.length - 2;
                                while (i >= 0 && builders[i][2]) {
                                    srcParent.removeChild(builders[i][1]);
                                    builders.splice(i, 1);
                                    i--;
                                }
                            }
                        }
                        break;
                    case Node.TEXT_NODE:
                        let str = srcNode.data;
                        if (this.bTrimLeft && /^\s*$/.test(str))
                            str = "";
                        else
                            str = str.replace(/^\s+|\s+$/, ' ');
                        if (str != '') {
                            this.bTrimLeft = / $/.test(str);
                            const getText = this.CompInterpolatedString(str);
                            async function Text(area) {
                                const content = getText(area.env);
                                if (area.bInit) {
                                    const textRange = new Range(area.parent.insertBefore(document.createTextNode(content), area.before), 'text');
                                    UpdatePrevArea(area, textRange);
                                }
                                else
                                    area.range.node.data = content;
                            }
                            builders.push([Text, srcNode, getText.isBlank]);
                        }
                        else
                            srcParent.removeChild(srcNode);
                        break;
                    default:
                        srcParent.removeChild(srcNode);
                        continue;
                }
            }
            ;
        }
        finally {
            if (!bNorestore)
                this.RestoreContext(saved);
        }
        return builders.length == 0 ? async () => { } :
            async function ChildNodes(area) {
                const savedEnv = SaveEnv();
                try {
                    for (const [builder, node] of builders)
                        await this.CallWithErrorHandling(builder, node, area);
                    this.builtNodeCount += builders.length;
                }
                finally {
                    if (!bNorestore)
                        RestoreEnv(savedEnv);
                }
            };
    }
    static preMods = ['reacton', 'reactson', 'thisreactson'];
    CompElement(srcParent, srcElm, bBlockLevel) {
        const atts = new Atts(srcElm);
        let builder = null;
        const mapReacts = [];
        for (const attName of RCompiler.preMods) {
            const val = atts.get(attName);
            if (val)
                mapReacts.push({ attName, rvars: val.split(',').map(expr => this.CompJavaScript(expr)) });
        }
        labelNoCheck: try {
            const construct = this.Constructs.get(srcElm.tagName);
            if (construct)
                builder = this.CompInstance(srcParent, srcElm, atts, construct);
            else {
                switch (srcElm.tagName) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            srcParent.removeChild(srcElm);
                            const rvarName = atts.get('rvar');
                            const varName = rvarName || atts.get('name') || atts.get('var', true);
                            const getValue = this.CompParameter(atts, 'value');
                            const getStore = rvarName && this.CompAttrExpression(atts, 'store');
                            const newVar = this.NewVar(varName);
                            const bReact = atts.get('reacting') != null;
                            const subBuilder = this.CompChildNodes(srcElm);
                            builder = async function DEFINE(area) {
                                const subArea = PrepareArea(srcElm, area);
                                if (area.bInit || bReact) {
                                    const value = getValue && getValue(area.env);
                                    subArea.range.rResult = rvarName
                                        ? new _RVAR(this, null, value, getStore && getStore(area.env), rvarName)
                                        : value;
                                }
                                newVar(area.env)(subArea.range.rResult);
                                await subBuilder.call(this, subArea);
                            };
                        }
                        break;
                    case 'IF':
                    case 'CASE':
                        {
                            const bHiding = CBool(atts.get('hiding'));
                            const caseList = [];
                            const getCondition = (srcElm.nodeName == 'IF') && this.CompAttrExpression(atts, 'cond', true);
                            const getValue = this.CompAttrExpression(atts, 'value');
                            atts.CheckNoAttsLeft();
                            const bodyNodes = [];
                            const bTrimLeft = this.bTrimLeft;
                            for (const child of srcElm.childNodes) {
                                if (child.nodeType == Node.ELEMENT_NODE) {
                                    const childElm = child;
                                    const atts = new Atts(childElm);
                                    this.bTrimLeft = bTrimLeft;
                                    const saved = this.SaveContext();
                                    try {
                                        let condition;
                                        let patt;
                                        switch (child.nodeName) {
                                            case 'WHEN':
                                                condition = this.CompAttrExpression(atts, 'cond');
                                                let pattern;
                                                if ((pattern = atts.get('match')) != null)
                                                    patt = this.CompPattern(pattern);
                                                else if ((pattern = atts.get('urlmatch')) != null)
                                                    (patt = this.CompPattern(pattern)).url = true;
                                                else if ((pattern = atts.get('regmatch')) != null) {
                                                    const lvars = atts.get('captures')?.split(',') || [];
                                                    patt = { regex: new RegExp(pattern, 'i'), lvars: lvars.map(this.NewVar.bind(this)) };
                                                }
                                                else
                                                    patt = null;
                                                if (bHiding && patt?.lvars.length)
                                                    throw `Pattern capturing cannot be combined with hiding`;
                                                if (patt && !getValue)
                                                    throw `Match requested but no 'value' specified.`;
                                            case 'ELSE':
                                                const builder = this.CompChildNodes(childElm, bBlockLevel);
                                                caseList.push({ condition, patt, builder, childElm });
                                                atts.CheckNoAttsLeft();
                                                continue;
                                        }
                                    }
                                    catch (err) {
                                        throw `${OuterOpenTag(childElm)}${err}`;
                                    }
                                    finally {
                                        this.RestoreContext(saved);
                                    }
                                }
                                bodyNodes.push(child);
                            }
                            if (getCondition)
                                caseList.unshift({
                                    condition: getCondition, patt: null,
                                    builder: this.CompChildNodes(srcElm, bBlockLevel, bodyNodes),
                                    childElm: srcElm
                                });
                            builder =
                                async function CASE(area) {
                                    const { bInit, env } = area;
                                    const value = getValue && getValue(env);
                                    let choosenAlt = null;
                                    let matchResult;
                                    for (const alt of caseList)
                                        try {
                                            if ((!alt.condition || alt.condition(env))
                                                && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))) {
                                                choosenAlt = alt;
                                                break;
                                            }
                                        }
                                        catch (err) {
                                            throw `${OuterOpenTag(alt.childElm)}${err}`;
                                        }
                                    if (bHiding) {
                                        for (const alt of caseList) {
                                            const childRange = PrepareElement(alt.childElm, area);
                                            const bHidden = childRange.node.hidden = alt != choosenAlt;
                                            if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                                await this.CallWithErrorHandling(alt.builder, alt.childElm, { parent: childRange.node, range: childRange, bInit, env });
                                        }
                                    }
                                    else {
                                        const subArea = PrepareArea(srcElm, area);
                                        ClearRange(subArea, false, choosenAlt);
                                        if (choosenAlt) {
                                            const saved = SaveEnv();
                                            try {
                                                if (choosenAlt.patt) {
                                                    let i = 1;
                                                    for (const lvar of choosenAlt.patt.lvars)
                                                        lvar(env)((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[i++]));
                                                }
                                                await this.CallWithErrorHandling(choosenAlt.builder, choosenAlt.childElm, subArea);
                                            }
                                            finally {
                                                RestoreEnv(saved);
                                            }
                                        }
                                    }
                                };
                            this.bTrimLeft = false;
                        }
                        break;
                    case 'FOR':
                    case 'FOREACH':
                        builder = this.CompFor(srcParent, srcElm, atts, bBlockLevel);
                        break;
                    case 'INCLUDE':
                        {
                            const src = atts.get('src', true);
                            let C = new RCompiler(this);
                            const task = (async () => {
                                const textContent = await FetchText(src);
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html');
                                C.Compile(parsedContent.body, this.Settings, false);
                                this.bHasReacts ||= C.bHasReacts;
                            })();
                            builder =
                                async function INCLUDE(area) {
                                    const t0 = performance.now();
                                    await task;
                                    this.buildStart += performance.now() - t0;
                                    await C.Builder(area);
                                    this.builtNodeCount += C.builtNodeCount;
                                };
                        }
                        break;
                    case 'IMPORT':
                        {
                            const src = atts.get('src', true);
                            const listImports = new Array();
                            const dummyEnv = NewEnv();
                            for (const child of srcElm.children) {
                                const signature = this.ParseSignature(child);
                                const holdOn = async function holdOn(area, args, mapSlotBuilders, slotEnv) {
                                    const t0 = performance.now();
                                    await task;
                                    this.buildStart += performance.now() - t0;
                                    area.env = placeholder.constructEnv;
                                    for (const builder of placeholder.instanceBuilders)
                                        await builder.call(this, area, args, mapSlotBuilders, slotEnv);
                                };
                                const placeholder = { instanceBuilders: [holdOn], constructEnv: dummyEnv };
                                listImports.push([signature, placeholder]);
                                this.AddConstruct(signature);
                            }
                            const compiler = new RCompiler();
                            compiler.Settings.bRunScripts = true;
                            const task = (async () => {
                                let promiseModule = Modules.get(src);
                                if (!promiseModule) {
                                    promiseModule = FetchText(src)
                                        .then(async (textContent) => {
                                        const parser = new DOMParser();
                                        const parsedContent = parser.parseFromString(textContent, 'text/html');
                                        const builder = compiler.CompChildNodes(parsedContent.body, true, undefined, true);
                                        this.bHasReacts ||= compiler.bHasReacts;
                                        const env = NewEnv();
                                        await builder.call(this, { parent: parsedContent.body, start: null, bInit: true, env });
                                        return { Signatures: compiler.Constructs, ConstructDefs: env.constructDefs };
                                    });
                                    Modules.set(src, promiseModule);
                                }
                                const module = await promiseModule;
                                for (const [clientSig, placeholder] of listImports) {
                                    const { tagName } = clientSig;
                                    const signature = module.Signatures.get(tagName);
                                    if (!signature)
                                        throw `<${tagName}> is missing in '${src}'`;
                                    if (!clientSig.IsCompatible(signature))
                                        throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signature.srcElm.outerHTML}`;
                                    const constructdef = module.ConstructDefs.get(tagName);
                                    placeholder.instanceBuilders = constructdef.instanceBuilders;
                                    placeholder.constructEnv = constructdef.constructEnv;
                                }
                            })();
                            srcParent.removeChild(srcElm);
                            builder = async function IMPORT({ env }) {
                                for (const [{ tagName: TagName }, constructDef] of listImports.values()) {
                                    const prevDef = env.constructDefs.get(TagName);
                                    env.constructDefs.set(TagName, constructDef);
                                    envActions.push(() => { env.constructDefs.set(TagName, prevDef); });
                                }
                            };
                        }
                        ;
                        break;
                    case 'REACT':
                        {
                            this.bHasReacts = true;
                            const reacts = atts.get('on', true, true);
                            const getDependencies = reacts ? reacts.split(',').map(expr => this.CompJavaScript(expr)) : [];
                            const bodyBuilder = this.CompChildNodes(srcElm, bBlockLevel);
                            builder = async function REACT(area) {
                                let subArea = PrepareArea(srcElm, area);
                                await bodyBuilder.call(this, subArea);
                                if (area.bInit) {
                                    const subscriber = new Subscriber(subArea, bodyBuilder);
                                    for (const getRvar of getDependencies) {
                                        const rvar = getRvar(subArea.env);
                                        rvar.Subscribe(subscriber);
                                    }
                                }
                            };
                        }
                        break;
                    case 'RHTML':
                        {
                            const bodyBuilder = this.CompChildNodes(srcElm, bBlockLevel);
                            srcParent.removeChild(srcElm);
                            let preModifiers;
                            preModifiers = this.CompAttributes(atts).preModifiers;
                            builder = async function RHTML(area) {
                                const tempElm = document.createElement('RHTML');
                                await bodyBuilder.call(this, { parent: tempElm, env: area.env, bInit: true, range: null });
                                const result = tempElm.innerText;
                                let { bInit } = area;
                                const range = PrepareElement(srcElm, area, 'rhtml-rhtml'), elm = range.node;
                                ApplyModifiers(elm, preModifiers, area);
                                const shadowRoot = bInit ? elm.attachShadow({ mode: 'open' }) : elm.shadowRoot;
                                if (bInit || result != range.rResult) {
                                    range.rResult = result;
                                    tempElm.innerHTML = result;
                                    try {
                                        if (range.hdrElms) {
                                            for (const elm of range.hdrElms)
                                                elm.remove();
                                            range.hdrElms = null;
                                        }
                                        const R = new RCompiler();
                                        R.StyleRoot = shadowRoot;
                                        R.Compile(tempElm, { bRunScripts: true }, false);
                                        range.hdrElms = R.AddedHeaderElements;
                                        shadowRoot.innerHTML = '';
                                        const subArea = PrepareArea(srcElm, { parent: shadowRoot, bInit: true, env: NewEnv(), range });
                                        await R.Build(subArea);
                                        this.builtNodeCount += R.builtNodeCount;
                                    }
                                    catch (err) {
                                        shadowRoot.appendChild(createErrorNode(`Compile error: ${err}`));
                                    }
                                }
                            };
                        }
                        break;
                    case 'SCRIPT':
                        builder = this.CompScript(srcParent, srcElm, atts);
                        break;
                    case 'STYLE':
                        builder = this.CompStyle(srcElm);
                        break;
                    case 'COMPONENT':
                        builder = this.CompComponent(srcParent, srcElm, atts);
                        break;
                    default:
                        builder = this.CompHTMLElement(srcElm, atts);
                        break labelNoCheck;
                }
                atts.CheckNoAttsLeft();
            }
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        for (const { attName, rvars } of mapReacts) {
            const bNoChildUpdates = (attName == 'thisreactson'), bodyBuilder = builder;
            builder = async function REACT(area) {
                const subArea = PrepareArea(srcElm, area, attName);
                await bodyBuilder.call(this, subArea);
                if (area.bInit) {
                    const subscriber = new Subscriber(subArea, async function reacton(reg) {
                        if (bNoChildUpdates && !reg.bInit)
                            reg.bNoChildBuilding = true;
                        await this.CallWithErrorHandling(bodyBuilder, srcElm, reg);
                        this.builtNodeCount++;
                    });
                    for (const getRvar of rvars) {
                        const rvar = getRvar(area.env);
                        rvar.Subscribe(subscriber);
                    }
                }
            };
            this.bHasReacts = true;
        }
        if (builder)
            return [builder, srcElm];
        return null;
    }
    async CallWithErrorHandling(builder, srcNode, area) {
        let { range } = area;
        if (range && range.errorNode) {
            area.parent.removeChild(range.errorNode);
            range.errorNode = undefined;
        }
        try {
            await builder.call(this, area);
        }
        catch (err) {
            const message = srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode = area.parent.insertBefore(createErrorNode(message), area.range.First);
                if (range)
                    range.errorNode = errorNode;
            }
        }
    }
    CompScript(srcParent, srcElm, atts) {
        srcParent.removeChild(srcElm);
        const bModule = atts.get('type') == 'module';
        const src = atts.get('src');
        if (atts.get('nomodule') != null || this.Settings.bRunScripts) {
            if (src) {
                srcElm.noModule = false;
                document.body.appendChild(srcElm);
                this.AddedHeaderElements.push(srcElm);
            }
            else {
                let script = srcElm.text + '\n';
                const defines = atts.get('defines');
                if (src && defines)
                    throw `'src' and'defines' cannot be combined (yet)`;
                const lvars = [];
                if (defines) {
                    for (let name of defines.split(','))
                        lvars.push(this.NewVar(name));
                    let exports;
                    async function SCRIPT({ env }) {
                        let i = 0;
                        for (const lvar of lvars)
                            lvar(env)(exports[i++]);
                    }
                    if (bModule) {
                        const objectURL = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
                        const task = import(objectURL);
                        return async function SCRIPT(reg) {
                            if (!exports)
                                exports = await task;
                            await SCRIPT(reg);
                        };
                    }
                    else {
                        exports = globalEval(`'use strict'\n;${script};[${defines}]\n`);
                        return SCRIPT;
                    }
                }
                else
                    globalEval(`'use strict';{${script}}`);
            }
        }
        return null;
    }
    CompFor(srcParent, srcElm, atts, bBlockLevel) {
        const varName = atts.get('let');
        let indexName = atts.get('index');
        if (indexName == '')
            indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) {
                const getRange = this.CompAttrExpression(atts, 'of', true);
                let prevName = atts.get('previous');
                if (prevName == '')
                    prevName = 'previous';
                let nextName = atts.get('next');
                if (nextName == '')
                    nextName = 'next';
                const bReactive = CBool(atts.get('updateable') ?? atts.get('reactive'));
                const getUpdatesTo = this.CompAttrExpression(atts, 'updates');
                const initVar = this.NewVar(varName);
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);
                const initNext = this.NewVar(nextName);
                const getKey = this.CompAttrExpression(atts, 'key');
                const getHash = this.CompAttrExpression(atts, 'hash');
                const bodyBuilder = this.CompChildNodes(srcElm);
                srcParent.removeChild(srcElm);
                return async function FOREACH(area) {
                    const subArea = PrepareArea(srcElm, area);
                    if (!getKey)
                        ClearRange(subArea, true);
                    const { parent, env } = subArea;
                    const range = subArea.range;
                    const savedEnv = SaveEnv();
                    try {
                        const keyMap = (area.bInit ? range.keyMap = new Map() : range.keyMap);
                        const newMap = new Map();
                        const setVar = initVar(env);
                        const iterator = getRange(env);
                        if (iterator !== undefined) {
                            if (!iterator || !(iterator[Symbol.iterator] || iterator[Symbol.asyncIterator]))
                                throw `[of]: Value (${iterator}) is not iterable`;
                            for await (const item of iterator) {
                                setVar(item);
                                const hash = getHash && getHash(env);
                                const key = getKey ? getKey(env) : hash;
                                if (key != null && newMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                newMap.set(key ?? {}, { item, hash });
                            }
                        }
                        let nextChild = range.child;
                        function RemoveStaleItemsHere() {
                            let key;
                            while (nextChild && !newMap.has(key = nextChild.key)) {
                                if (key != null)
                                    keyMap.delete(key);
                                for (const node of nextChild.ChildNodes())
                                    parent.removeChild(node);
                                nextChild = nextChild.next;
                            }
                        }
                        const setIndex = initIndex(env);
                        const setPrevious = initPrevious(env);
                        const setNext = initNext(env);
                        let index = 0, prevItem = null, nextItem, prevRange = null;
                        const nextIterator = nextName ? newMap.values() : null;
                        let childArea;
                        if (nextIterator)
                            nextIterator.next();
                        RemoveStaleItemsHere();
                        for (const [key, { item, hash }] of newMap) {
                            if (nextIterator)
                                nextItem = nextIterator.next().value?.item;
                            let subscriber = keyMap.get(key), childRange;
                            if (subscriber && (childRange = subscriber.range).isConnected) {
                                if (childRange != nextChild) {
                                    const nextNode = nextChild.First;
                                    for (const node of childRange.ChildNodes())
                                        parent.insertBefore(node, nextNode);
                                }
                                else
                                    nextChild = childRange.next;
                                childRange.text = `${varName}(${index})`;
                                subArea.bInit = false;
                                subArea.range = childRange;
                                childArea = PrepareArea(null, subArea);
                            }
                            else {
                                subArea.bInit = true;
                                subArea.before = nextChild?.First || area.range?.First;
                                childArea = PrepareArea(null, subArea, `${varName}(${index})`);
                                subscriber = new Subscriber((bReactive ? area : { ...area, env: undefined }), (bReactive ? bodyBuilder : undefined));
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, subscriber);
                                }
                                childRange = childArea.range;
                                childRange.key = key;
                            }
                            if (prevRange)
                                prevRange.next = childRange;
                            prevRange = childRange;
                            if (hash != null
                                && (hash == childRange.hash
                                    || (childRange.hash = hash, false))) {
                            }
                            else {
                                let rvar = (getUpdatesTo ? this.RVAR_Light(item, [getUpdatesTo(env)])
                                    : bReactive ? this.RVAR_Light(item)
                                        : item);
                                setVar(rvar);
                                setIndex(index);
                                setPrevious(prevItem);
                                if (nextIterator)
                                    setNext(nextItem);
                                await bodyBuilder.call(this, childArea);
                                if (bReactive)
                                    rvar.Subscribe(subscriber);
                            }
                            prevItem = item;
                            index++;
                            RemoveStaleItemsHere();
                        }
                    }
                    finally {
                        RestoreEnv(savedEnv);
                    }
                };
            }
            else {
                const slotName = atts.get('of', true, true);
                const slot = this.Constructs.get(slotName);
                if (!slot)
                    throw `Missing attribute [let]`;
                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompChildNodes(srcElm, bBlockLevel);
                srcParent.removeChild(srcElm);
                return async function FOREACH_Slot(area) {
                    const subArea = PrepareArea(srcElm, area);
                    const env = subArea.env;
                    const saved = SaveEnv();
                    const slotDef = env.constructDefs.get(slotName);
                    try {
                        const setIndex = initIndex(area.env);
                        let index = 0;
                        for (const slotBuilder of slotDef.instanceBuilders) {
                            setIndex(index++);
                            env.constructDefs.set(slotName, { instanceBuilders: [slotBuilder], constructEnv: slotDef.constructEnv });
                            await bodyBuilder.call(this, subArea);
                        }
                    }
                    finally {
                        env.constructDefs.set(slotName, slotDef);
                        RestoreEnv(saved);
                    }
                };
            }
        }
        finally {
            this.RestoreContext(saved);
        }
    }
    ParseSignature(elmSignature) {
        const signature = new Signature(elmSignature);
        for (const attr of elmSignature.attributes) {
            if (signature.RestParam)
                throw `Rest parameter must be the last`;
            const m = /^(#|\.\.\.)?(.*?)(\?)?$/.exec(attr.name);
            if (m[1] == '...')
                signature.RestParam = { name: m[2], pDefault: undefined };
            else
                signature.Parameters.push({ name: m[2],
                    pDefault: attr.value != ''
                        ? (m[1] == '#' ? this.CompJavaScript(attr.value) : this.CompInterpolatedString(attr.value))
                        : m[3] ? (_) => undefined
                            : null
                });
        }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.tagName, this.ParseSignature(elmSlot));
        return signature;
    }
    CompComponent(srcParent, srcElm, atts) {
        srcParent.removeChild(srcElm);
        const builders = [];
        let signature, elmTemplate;
        const bEncapsulate = CBool(atts.get('encapsulate'));
        const styles = [];
        for (const srcChild of Array.from(srcElm.children)) {
            const childAtts = new Atts(srcChild);
            let builder;
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    builder = this.CompScript(srcElm, srcChild, childAtts);
                    break;
                case 'STYLE':
                    if (bEncapsulate)
                        styles.push(srcChild);
                    else
                        this.CompStyle(srcChild);
                    break;
                case 'TEMPLATE':
                    if (elmTemplate)
                        throw 'Double <TEMPLATE>';
                    elmTemplate = srcChild;
                    break;
                default:
                    if (signature)
                        throw 'Double signature';
                    signature = this.ParseSignature(srcChild);
                    break;
            }
            if (builder)
                builders.push([builder, srcChild]);
        }
        if (!signature)
            throw `Missing signature`;
        if (!elmTemplate)
            throw 'Missing <TEMPLATE>';
        if (bEncapsulate && !signature.RestParam)
            signature.RestParam = { name: null, pDefault: null };
        this.AddConstruct(signature);
        const { tagName } = signature;
        const instanceBuilders = [
            this.CompTemplate(signature, elmTemplate.content, elmTemplate, false, bEncapsulate, styles)
        ];
        return (async function COMPONENT(area) {
            for (const [bldr, srcNode] of builders)
                await this.CallWithErrorHandling(bldr, srcNode, area);
            const construct = { instanceBuilders, constructEnv: undefined };
            const { env } = area;
            const prevDef = env.constructDefs.get(tagName);
            env.constructDefs.set(tagName, construct);
            construct.constructEnv = CloneEnv(env);
            envActions.push(() => { env.constructDefs.set(tagName, prevDef); });
        });
    }
    CompTemplate(signat, contentNode, srcElm, bNewNames, bEncaps, styles, atts) {
        const names = [], saved = this.SaveContext();
        let bCheckAtts;
        if (bCheckAtts = !atts)
            atts = new Atts(srcElm);
        for (const param of signat.Parameters)
            names.push(atts.get(param.name, bNewNames) || param.name);
        const { tagName, RestParam } = signat;
        if (RestParam?.name)
            names.push(atts.get(`...${RestParam.name}`, bNewNames) || RestParam.name);
        for (const S of signat.Slots.values())
            this.AddConstruct(S);
        if (bCheckAtts)
            atts.CheckNoAttsLeft();
        try {
            const lvars = names.map(name => this.NewVar(name));
            const builder = this.CompChildNodes(contentNode);
            const customName = /^[A-Z].*-/.test(tagName) ? tagName : `RHTML-${tagName}`;
            return async function TEMPLATE(area, args, mapSlotBuilders, slotEnv) {
                const saved = SaveEnv();
                const { env, bInit } = area;
                try {
                    for (const [slotName, instanceBuilders] of mapSlotBuilders) {
                        const savedDef = env.constructDefs.get(slotName);
                        envActions.push(() => { env.constructDefs.set(slotName, savedDef); });
                        env.constructDefs.set(slotName, { instanceBuilders, constructEnv: slotEnv });
                    }
                    let i = 0;
                    for (const lvar of lvars)
                        lvar(area.env)(args[i++]);
                    if (bEncaps) {
                        const range = PrepareElement(srcElm, area, customName), elm = range.node;
                        const shadow = bInit ? elm.attachShadow({ mode: 'open' }) : elm.shadowRoot;
                        area = { parent: shadow, range, bInit, env };
                        if (bInit)
                            for (const style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        if (args[i])
                            ApplyModifier(elm, ModifType.RestArgument, null, args[i], bInit);
                    }
                    await builder.call(this, area);
                }
                finally {
                    RestoreEnv(saved);
                }
            };
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        finally {
            this.RestoreContext(saved);
        }
    }
    CompInstance(srcParent, srcElm, atts, signature) {
        srcParent.removeChild(srcElm);
        const tagName = signature.tagName;
        const getArgs = [];
        for (const { name, pDefault } of signature.Parameters)
            getArgs.push(this.CompParameter(atts, name, !pDefault) || pDefault);
        const slotBuilders = new Map();
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);
        let slotElm, Slot;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE
                && (Slot = signature.Slots.get((slotElm = node).tagName))) {
                slotBuilders.get(slotElm.tagName).push(this.CompTemplate(Slot, slotElm, slotElm, true));
                srcElm.removeChild(node);
            }
        const contentSlot = signature.Slots.get('CONTENT');
        if (contentSlot)
            slotBuilders.get('CONTENT').push(this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts));
        const preModifiers = signature.RestParam ? this.CompAttributes(atts).preModifiers : null;
        atts.CheckNoAttsLeft();
        this.bTrimLeft = false;
        return async function INSTANCE(area) {
            const subArea = PrepareArea(srcElm, area);
            const localEnv = subArea.env;
            const { instanceBuilders, constructEnv } = localEnv.constructDefs.get(tagName);
            const savedEnv = SaveEnv();
            try {
                const args = [];
                for (const getArg of getArgs)
                    args.push(getArg(localEnv));
                if (signature.RestParam) {
                    const rest = [];
                    for (const { modType, name, depValue } of preModifiers)
                        rest.push({ modType, name, value: depValue(localEnv) });
                    args.push(rest);
                }
                const slotEnv = signature.Slots.size ? CloneEnv(localEnv) : null;
                subArea.env = constructEnv;
                for (const parBuilder of instanceBuilders)
                    await parBuilder.call(this, subArea, args, slotBuilders, slotEnv);
            }
            finally {
                RestoreEnv(savedEnv);
            }
        };
    }
    CompHTMLElement(srcElm, atts) {
        const nodeName = srcElm.nodeName.replace(/\.+$/, '');
        const bTrim = /^(BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL)$/.test(nodeName);
        const { preModifiers, postModifiers } = this.CompAttributes(atts);
        if (bTrim)
            this.bTrimLeft = true;
        const childnodesBuilder = this.CompChildNodes(srcElm, bTrim);
        if (bTrim)
            this.bTrimLeft = true;
        const builder = async function ELEMENT(area) {
            const { bInit, env } = area;
            const range = PrepareElement(srcElm, area, nodeName), elm = range.node;
            elm.removeAttribute('class');
            if (!area.bNoChildBuilding)
                await childnodesBuilder.call(this, { parent: elm, range: range.child, bInit, env, parentR: range });
            ApplyModifiers(elm, preModifiers, area);
            ApplyModifiers(elm, postModifiers, area);
        };
        builder.bTrim = bTrim;
        return builder;
    }
    CompAttributes(atts) {
        const preModifiers = [], postModifiers = [];
        for (const [attName, attValue] of atts) {
            let m;
            try {
                if (m = /^on(create|update)$/i.exec(attName))
                    postModifiers.push({
                        modType: ModifType[attName],
                        name: m[0],
                        depValue: this.CompJavaScript(`function ${attName}(){${attValue}\n}`)
                    });
                else if (m = /^on(.*)$/i.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Event,
                        name: CapitalizeProp(m[0]),
                        depValue: this.CompJavaScript(`function ${attName}(event){${attValue}\n}`)
                    });
                else if (m = /^#class:(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Class, name: m[1],
                        depValue: this.CompJavaScript(attValue)
                    });
                else if (m = /^#style\.(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript(attValue)
                    });
                else if (m = /^style\.(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompInterpolatedString(attValue)
                    });
                else if (attName == '+style')
                    preModifiers.push({
                        modType: ModifType.AddToStyle, name: null,
                        depValue: this.CompJavaScript(attValue)
                    });
                else if (m = /^#(.*)/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Prop, name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript(attValue)
                    });
                else if (attName == "+class")
                    preModifiers.push({
                        modType: ModifType.AddToClassList, name: null,
                        depValue: this.CompJavaScript(attValue)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attName)) {
                    const propName = CapitalizeProp(m[3]);
                    try {
                        const setter = this.CompJavaScript(`function(){const ORx=this.${propName};if(${attValue}!==ORx)${attValue}=ORx}`);
                        if (m[1] == '@')
                            preModifiers.push({ modType: ModifType.Prop, name: propName, depValue: this.CompJavaScript(attValue) });
                        else
                            postModifiers.push({ modType: ModifType.oncreate, name: 'oncreate', depValue: setter });
                        preModifiers.push({ modType: ModifType.Event, name: m[2] ? 'onchange' : 'oninput', depValue: setter });
                    }
                    catch (err) {
                        throw `Invalid left-hand side '${attValue}'`;
                    }
                }
                else if (m = /^\.\.\.(.*)/.exec(attName)) {
                    if (attValue)
                        throw `Rest parameter cannot have a value`;
                    preModifiers.push({
                        modType: ModifType.RestArgument, name: null,
                        depValue: this.CompName(m[1])
                    });
                }
                else
                    preModifiers.push({
                        modType: ModifType.Attr, name: attName,
                        depValue: this.CompInterpolatedString(attValue)
                    });
            }
            catch (err) {
                throw (`[${attName}]: ${err}`);
            }
        }
        atts.clear();
        return { preModifiers, postModifiers };
    }
    CompStyle(srcStyle) {
        this.StyleRoot.appendChild(srcStyle);
        this.AddedHeaderElements.push(srcStyle);
        return null;
    }
    CompInterpolatedString(data, name) {
        const generators = [], regIS = /(?<![\\$])\$?\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/gs;
        let isBlank = true, isTrivial = true;
        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data), fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed)
                generators.push(fixed.replace(/\\([${}\\])/g, '$1'));
            if (m[1] || /[^ \t\r\n]/.test(fixed)) {
                isBlank = false;
                if (m[1]) {
                    generators.push(this.CompJavaScript(m[1], '{}'));
                    isTrivial = false;
                }
            }
        }
        let dep;
        if (isTrivial) {
            const result = generators.join('');
            dep = () => result;
        }
        else
            dep = (env) => {
                try {
                    let result = "";
                    for (const gen of generators)
                        result += (typeof gen == 'string' ? gen : gen(env) ?? '');
                    return result;
                }
                catch (err) {
                    throw name ? `[${name}]: ${err}` : err;
                }
            };
        dep.isBlank = isBlank;
        dep.bUsesThis = false;
        return dep;
    }
    CompPattern(patt) {
        let reg = '', lvars = [];
        const regIS = /(?<![\\$])\$?\{(.*?)(?<!\\)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;
        while (regIS.lastIndex < patt.length) {
            const lastIndex = regIS.lastIndex;
            const m = regIS.exec(patt);
            const literals = patt.substring(lastIndex, m.index);
            if (literals)
                reg += quoteReg(literals);
            if (m[1]) {
                reg += `(.*?)`;
                lvars.push(this.NewVar(m[1]));
            }
            else if (m[0] == '?')
                reg += '.';
            else if (m[0] == '*')
                reg += '.*';
            else if (m[2])
                reg += m[2];
            else
                reg += m[0];
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i') };
    }
    CompParameter(atts, attName, bRequired) {
        const value = atts.get(attName);
        return (value == null ? this.CompAttrExpression(atts, attName, bRequired)
            : /^on/.test(attName) ? this.CompJavaScript(`function ${attName}(event){${value}\n}`)
                : this.CompInterpolatedString(value));
    }
    CompAttrExpression(atts, attName, bRequired) {
        return this.CompJavaScript(atts.get(attName, bRequired, true));
    }
    CompJavaScript(expr, delims = '""', descript) {
        if (expr == null)
            return null;
        const bThis = /\bthis\b/.test(expr), depExpr = bThis ?
            `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
            : `'use strict';([${this.context}])=>(${expr}\n)`, errorInfo = `${descript ? `[${descript}] ` : ''}${delims[0]}${Abbreviate(expr, 60)}${delims[1]}: `;
        try {
            const routine = globalEval(depExpr), depValue = (bThis
                ? function (env) {
                    try {
                        return routine.call(this, env);
                    }
                    catch (err) {
                        throw `${errorInfo}${err}`;
                    }
                }
                : (env) => {
                    try {
                        return routine(env);
                    }
                    catch (err) {
                        throw `${errorInfo}${err}`;
                    }
                });
            depValue.bUsesThis = bThis;
            return depValue;
        }
        catch (err) {
            throw `${errorInfo}${err}`;
        }
    }
    CompName(name) {
        const i = this.ContextMap.get(name);
        if (i === undefined)
            throw `Unknown name '${name}'`;
        return env => env[i];
    }
}
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
class _RVAR {
    rRuntime;
    store;
    storeName;
    constructor(rRuntime, globalName, initialValue, store, storeName) {
        this.rRuntime = rRuntime;
        this.store = store;
        this.storeName = storeName;
        if (globalName)
            globalThis[globalName] = this;
        let s;
        if ((s = store && store.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch { }
        this._Value = initialValue;
        this.storeName ||= globalName;
    }
    _Value;
    Subscribers = new Set();
    Subscribe(s) {
        this.Subscribers.add(s);
    }
    get V() { return this._Value; }
    set V(t) {
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
        }
    }
    get U() { this.SetDirty(); return this._Value; }
    set U(t) { this.V = t; }
    SetDirty() {
        if (this.store)
            this.rRuntime.DirtyVars.add(this);
        for (const sub of this.Subscribers)
            if (sub.range.First?.isConnected)
                this.rRuntime.AddDirty(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.RUpdate();
    }
    Save() {
        this.store.setItem(`RVAR_${this.storeName}`, JSON.stringify(this._Value));
    }
}
class Atts extends Map {
    constructor(elm) {
        super();
        for (const att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }
    get(name, bRequired, bHashAllowed) {
        let n = name, value = super.get(n);
        if (value == null && bHashAllowed) {
            n = `#${name}`;
            value = super.get(n);
        }
        if (value != null)
            super.delete(n);
        else if (bRequired)
            throw `Missing attribute [${name}]`;
        return value;
    }
    CheckNoAttsLeft() {
        if (super.size)
            throw `Unknown attribute${super.size > 1 ? 's' : ''}: ${Array.from(super.keys()).join(',')}`;
    }
}
const regIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/, regReserved = /^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/;
function CheckValidIdentifier(name) {
    name = name.trim();
    if (!regIdentifier.test(name))
        throw `Invalid identifier '${name}'`;
    if (regReserved.test(name))
        throw `Reserved keyword '${name}'`;
    return name;
}
const words = '(?:align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
    + '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|margin|max|min|node|offset|outer'
    + '|outline|overflow|owner|padding|parent|right|size|rule|scroll|selected|table|tab(?=index)|text|top|value|variant)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalizeProp(lcName) {
    return lcName.replace(regCapitalize, (char) => char.toUpperCase());
}
function OuterOpenTag(elm, maxLength) {
    return Abbreviate(/<.*?(?=>)/.exec(elm.outerHTML)[0], maxLength - 1) + '>';
}
function Abbreviate(s, maxLength) {
    return (maxLength && s.length > maxLength
        ? s.substr(0, maxLength - 3) + "..."
        : s);
}
function CBool(s, valOnEmpty = true) {
    if (typeof s == 'string')
        switch (s.toLowerCase()) {
            case "yes":
            case "true":
                return true;
            case "no":
            case "false":
                return false;
            case "":
                return valOnEmpty;
            default:
                return null;
        }
    return s;
}
function createErrorNode(message) {
    const node = document.createElement('div');
    node.style.color = 'crimson';
    node.style.fontFamily = 'sans-serif';
    node.style.fontSize = '10pt';
    node.innerText = message;
    return node;
}
async function FetchText(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw `GET '${url}' returned ${response.status} ${response.statusText}`;
    return await response.text();
}
export let RHTML = new RCompiler();
Object.defineProperties(globalThis, {
    RVAR: { get: () => RHTML.RVAR.bind(RHTML) },
    RUpdate: { get: () => RHTML.RUpdate.bind(RHTML) },
});
globalThis.RCompile = RCompile;
export const RVAR = globalThis.RVAR, RUpdate = globalThis.RUpdate;
export function* range(from, upto, step = 1) {
    if (upto === undefined) {
        upto = from;
        from = 0;
    }
    for (let i = from; i < upto; i += step)
        yield i;
}
globalThis.range = range;
export const docLocation = RVAR('docLocation', document.location);
function SetDocLocation() {
    docLocation.SetDirty();
    if (RootPath)
        docLocation.subpath = document.location.pathname.substr(RootPath.length);
}
window.addEventListener('popstate', SetDocLocation);
export const reroute = globalThis.reroute = (arg) => {
    history.pushState(null, null, typeof arg == 'string' ? arg : arg.target.href);
    SetDocLocation();
    return false;
};
