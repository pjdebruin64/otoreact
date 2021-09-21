const defaultSettings = {
    bAbortOnError: false,
    bShowErrors: true,
    bRunScripts: false,
    bBuild: true,
    rootPattern: null,
};
var WhiteSpace;
(function (WhiteSpace) {
    WhiteSpace[WhiteSpace["preserve"] = 0] = "preserve";
    WhiteSpace[WhiteSpace["keep"] = 1] = "keep";
    WhiteSpace[WhiteSpace["trim"] = 2] = "trim";
})(WhiteSpace || (WhiteSpace = {}));
class Range {
    constructor(node, text) {
        this.node = node;
        this.text = text;
        this.next = null;
        if (!node)
            this.child = null;
    }
    toString() { return this.text || this.node?.nodeName; }
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
        return this.endMark || null;
    }
    Nodes() {
        return (function* Nodes(r) {
            if (r.node)
                yield r.node;
            else {
                let child = r.child;
                while (child) {
                    yield* Nodes(child);
                    child = child.next;
                }
            }
            if (r.endMark)
                yield r.endMark;
        })(this);
    }
    get isConnected() {
        const f = this.First;
        return f && f.isConnected;
    }
}
function PrepareArea(srcElm, area, text = '', bMark, result) {
    let { parent, env, range, before } = area, subArea = { parent, env, range: null, }, bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        if (srcElm)
            text = `${srcElm.localName}${text ? ' ' : ''}${text}`;
        UpdatePrevArea(area, range = subArea.parentR = new Range(null, text));
        range.result = result;
        if (bMark)
            before = range.endMark = parent.insertBefore(document.createComment('/' + text), before);
    }
    else {
        subArea.range = range.child;
        area.range = range.next;
        if (bMark) {
            before = range.endMark;
            if (bMark == 1 && result != range.result || bMark == 2) {
                range.result = result;
                let node = range.First || before;
                while (node != before) {
                    const next = node.nextSibling;
                    parent.removeChild(node);
                    node = next;
                }
                range.child = null;
                subArea.range = null;
                subArea.parentR = range;
                bInit = true;
            }
        }
    }
    subArea.before = before;
    return { range, subArea, bInit };
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
    let elmRange = area.range, bInit = !elmRange;
    if (bInit) {
        const elm = (area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore(document.createElement(nodeName), area.before));
        elmRange = new Range(elm);
        UpdatePrevArea(area, elmRange);
    }
    else {
        area.range = elmRange.next;
    }
    return { elmRange,
        childArea: { parent: elmRange.node, range: elmRange.child, before: null, env: area.env,
            parentR: elmRange },
        bInit };
}
function PrepareText(area, content) {
    let range = area.range;
    if (!range) {
        range = new Range(area.parent.insertBefore(document.createTextNode(content), area.before), 'text');
        UpdatePrevArea(area, range);
    }
    else {
        range.node.data = content;
        area.range = range.next;
    }
}
const location = document.location;
let RootPath = null;
export function RCompile(elm, settings) {
    try {
        let { rootPattern } = settings = { ...defaultSettings, ...settings }, url = `${location.origin}${location.pathname}`;
        if (rootPattern) {
            const m = url.match(`^.*(${rootPattern})`);
            if (!m)
                throw `Root pattern '${rootPattern}' does not match URL '${url}'`;
            url = m[0];
        }
        RootPath = (new URL(url)).pathname.replace(/[^/]*$/, '');
        globalThis.RootPath = RootPath;
        SetLocation();
        const R = RHTML;
        R.FilePath = location.origin + RootPath;
        R.Compile(elm, settings, true);
        R.ToBuild.push({ parent: elm.parentElement, env: NewEnv(), source: elm, range: null });
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
class Signature {
    constructor(srcElm) {
        this.srcElm = srcElm;
        this.Parameters = [];
        this.RestParam = null;
        this.Slots = new Map();
        this.name = srcElm.localName;
    }
    IsCompatible(sig) {
        if (!sig)
            return false;
        let result = true;
        const mapSigParams = new Map(sig.Parameters.map(p => [p.name, p.pDefault]));
        for (const { name, pDefault } of this.Parameters)
            if (mapSigParams.has(name)) {
                result &&= (!pDefault || mapSigParams.get(name));
                mapSigParams.delete(name);
            }
            else
                result = false;
        for (const pDefault of mapSigParams.values())
            result &&= pDefault;
        result &&= !this.RestParam || this.RestParam.name == sig.RestParam?.name;
        for (let [slotname, slotSig] of this.Slots)
            result &&= sig.Slots.get(slotname)?.IsCompatible(slotSig);
        return !!result;
    }
}
const gEval = eval, gFetch = fetch;
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
let bReadOnly = false;
function ApplyModifier(elm, modType, name, val, bCreate) {
    switch (modType) {
        case ModifType.Attr:
            elm.setAttribute(name, val || '');
            break;
        case ModifType.Prop:
            if (val != null && val != elm[name])
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
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case ModifType.oncreate:
            if (bCreate)
                val.call(elm);
            break;
        case ModifType.onupdate:
            val.call(elm);
            break;
    }
}
function ApplyModifiers(elm, modifiers, env, bCreate) {
    for (const { modType, name, depValue } of modifiers) {
        try {
            bReadOnly = true;
            const value = depValue.bThis ? depValue.call(elm, env) : depValue(env);
            bReadOnly = false;
            ApplyModifier(elm, modType, name, value, bCreate);
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
    constructor(clone) {
        this.clone = clone;
        this.instanceNum = RCompiler.iNum++;
        this.restoreActions = [];
        this.ToBuild = [];
        this.AllAreas = [];
        this.whiteSpc = WhiteSpace.keep;
        this.bCompiled = false;
        this.bHasReacts = false;
        this.DirtyVars = new Set();
        this.DirtySubs = new Map();
        this.bUpdating = false;
        this.bUpdate = false;
        this.handleUpdate = null;
        this.sourceNodeCount = 0;
        this.builtNodeCount = 0;
        this.context = clone?.context || "";
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings = clone ? { ...clone.Settings } : { ...defaultSettings };
        this.AddedHeaderElements = clone?.AddedHeaderElements || [];
        this.StyleRoot = clone?.StyleRoot || document.head;
        this.StyleBefore = clone?.StyleBefore;
        this.FilePath = clone?.FilePath || location.origin + RootPath;
    }
    get MainC() { return this.clone || this; }
    SaveContext() {
        return this.restoreActions.length;
    }
    RestoreContext(savedContext) {
        for (let j = this.restoreActions.length; j > savedContext; j--)
            this.restoreActions.pop()();
    }
    NewVar(name) {
        let init;
        if (!name)
            init = ((_) => (_) => { });
        else {
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
            init = function InitVar(env) {
                const prev = env[i], j = i;
                envActions.push(() => { env[j] = prev; });
                return (value) => { env[j] = value; };
            }.bind(this);
        }
        init.varName = name;
        return init;
    }
    AddConstruct(C) {
        const Cnm = C.name, savedConstr = this.Constructs.get(Cnm);
        this.Constructs.set(Cnm, C);
        this.restoreActions.push(() => this.Constructs.set(Cnm, savedConstr));
    }
    Compile(elm, settings = {}, bIncludeSelf = false) {
        Object.assign(this.Settings, settings);
        const t0 = performance.now();
        const savedR = RHTML;
        try {
            if (!this.clone)
                RHTML = this;
            this.Builder =
                bIncludeSelf
                    ? this.CompElement(elm.parentElement, elm)[0]
                    : this.CompChildNodes(elm);
            this.bCompiled = true;
        }
        finally {
            RHTML = savedR;
        }
        const t1 = performance.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${(t1 - t0).toFixed(1)} ms`);
    }
    Subscriber(area, builder, range) {
        const { parent, before, bNoChildBuilding } = area, env = area.env && CloneEnv(area.env);
        return { before,
            notify: async () => {
                await builder.call(this, { range, parent, before, env, bNoChildBuilding });
            }
        };
    }
    async InitialBuild(area) {
        const savedRCompiler = RHTML, { parentR } = area;
        RHTML = this;
        await this.Builder(area);
        this.AllAreas.push(this.Subscriber(area, this.Builder, parentR ? parentR.child : area.prevR));
        RHTML = savedRCompiler;
    }
    AddDirty(sub) {
        this.MainC.DirtySubs.set(sub.before, sub);
    }
    RUpdate() {
        this.MainC.bUpdate = true;
        if (!this.clone && !this.bUpdating && !this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 2);
    }
    ;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating) {
            this.bUpdate = true;
            return;
        }
        for (let i = 0; i < 2; i++) {
            this.bUpdate = false;
            this.bUpdating = true;
            let savedRCompiler = RHTML;
            try {
                if (this.ToBuild.length) {
                    this.buildStart = performance.now();
                    this.builtNodeCount = 0;
                    for (const area of this.ToBuild)
                        await this.InitialBuild(area);
                    console.log(`Built ${this.builtNodeCount} nodes in ${(performance.now() - this.buildStart).toFixed(1)} ms`);
                    this.ToBuild = [];
                }
                else {
                    if (!this.MainC.bHasReacts)
                        for (const s of this.AllAreas)
                            this.AddDirty(s);
                    for (const rvar of this.DirtyVars)
                        rvar.Save();
                    this.DirtyVars.clear();
                    if (this.DirtySubs.size) {
                        if (!this.clone)
                            RHTML = this;
                        this.buildStart = performance.now();
                        this.builtNodeCount = 0;
                        const subs = this.DirtySubs;
                        this.DirtySubs = new Map();
                        for (const sub of subs.values()) {
                            try {
                                await sub.notify();
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
            }
            finally {
                RHTML = savedRCompiler;
                this.bUpdating = false;
            }
            if (!this.bUpdate)
                break;
        }
    }
    RVAR(name, initialValue, store) {
        return new _RVAR(this.MainC, name, initialValue, store, name);
    }
    ;
    RVAR_Light(t, updatesTo) {
        if (!t._Subscribers) {
            t._Subscribers = [];
            t._UpdatesTo = updatesTo;
            const R = this.MainC;
            Object.defineProperty(t, 'U', { get: function () {
                    for (const sub of t._Subscribers)
                        R.AddDirty(sub);
                    if (t._UpdatesTo?.length)
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
    CompChildNodes(srcParent, childNodes = srcParent.childNodes, bNorestore) {
        const builders = [], saved = this.SaveContext();
        try {
            for (const srcNode of childNodes) {
                switch (srcNode.nodeType) {
                    case Node.ELEMENT_NODE:
                        this.sourceNodeCount++;
                        const builderElm = this.CompElement(srcParent, srcNode);
                        if (builderElm) {
                            if (builderElm[0].whitespace == WhiteSpace.trim) {
                                let i = builders.length - 1;
                                while (i >= 0 && builders[i][2]) {
                                    builders.pop();
                                    i--;
                                }
                            }
                            builders.push(builderElm);
                        }
                        break;
                    case Node.TEXT_NODE:
                        this.sourceNodeCount++;
                        let str = srcNode.nodeValue;
                        if (this.whiteSpc != WhiteSpace.preserve)
                            str = str.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ' ');
                        const getText = this.CompInterpStr(str), fixed = getText.fixed;
                        if (fixed !== '') {
                            if (fixed == undefined)
                                builders.push([
                                    async function IText(area) {
                                        PrepareText(area, getText(area.env));
                                    },
                                    srcNode
                                ]);
                            else {
                                const isBlank = /^[ \t\r\n]*$/.test(fixed);
                                if (!(this.whiteSpc == WhiteSpace.trim && isBlank))
                                    builders.push([
                                        async function FText(area) {
                                            PrepareText(area, fixed);
                                        },
                                        srcNode, isBlank
                                    ]);
                            }
                            if (this.whiteSpc != WhiteSpace.preserve)
                                this.whiteSpc = /[ \t\r\n]$/.test(getText.last) ? WhiteSpace.trim : WhiteSpace.keep;
                        }
                        break;
                }
            }
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
    CompElement(srcParent, srcElm, whiteSpace) {
        const atts = new Atts(srcElm), mapReacts = [];
        let builder = null;
        for (const attName of RCompiler.preMods) {
            const val = atts.get(attName);
            if (val)
                mapReacts.push({ attName, rvars: val.split(',').map(expr => this.CompJavaScript(expr, attName)) });
        }
        labelNoCheck: try {
            const construct = this.Constructs.get(srcElm.localName);
            if (construct)
                builder = this.CompInstance(srcParent, srcElm, atts, construct);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define':
                        {
                            const rvarName = atts.get('rvar'), varName = rvarName || atts.get('name') || atts.get('var', true), getValue = this.CompParameter(atts, 'value'), getStore = rvarName && this.CompAttrExpr(atts, 'store'), bReact = CBool(atts.get('reacting') ?? atts.get('updating')), newVar = this.NewVar(varName), subBuilder = this.CompChildNodes(srcElm);
                            builder = async function DEF(area) {
                                const { range, subArea, bInit } = PrepareArea(srcElm, area);
                                if (bInit || bReact) {
                                    const value = getValue && getValue(area.env);
                                    if (rvarName)
                                        if (bInit)
                                            range.value = new _RVAR(this.MainC, null, value, getStore && getStore(area.env), rvarName);
                                        else
                                            range.value.V = value;
                                    else
                                        range.value = value;
                                }
                                newVar(area.env)(range.value);
                                await subBuilder.call(this, subArea);
                            };
                        }
                        break;
                    case 'if':
                    case 'case':
                        {
                            const bHiding = CBool(atts.get('hiding')), caseList = [], getCond = (srcElm.nodeName == 'IF') && this.CompAttrExpr(atts, 'cond', true), getVal = this.CompAttrExpr(atts, 'value');
                            atts.CheckNoAttsLeft();
                            const bodyNodes = [], bTrimLeft = this.whiteSpc;
                            for (const child of srcElm.childNodes) {
                                if (child.nodeType == Node.ELEMENT_NODE) {
                                    const childElm = child, atts = new Atts(childElm), saved = this.SaveContext();
                                    this.whiteSpc = bTrimLeft;
                                    try {
                                        let cond;
                                        let patt;
                                        switch (child.nodeName) {
                                            case 'WHEN':
                                                cond = this.CompAttrExpr(atts, 'cond');
                                                let pattern;
                                                patt =
                                                    (pattern = atts.get('match')) != null
                                                        ? this.CompPattern(pattern)
                                                        : (pattern = atts.get('urlmatch')) != null
                                                            ? this.CompPattern(pattern, true)
                                                            : (pattern = atts.get('regmatch')) != null
                                                                ? { regex: new RegExp(pattern, 'i'),
                                                                    lvars: (atts.get('captures')?.split(',') || []).map(this.NewVar.bind(this))
                                                                }
                                                                : null;
                                                if (bHiding && patt?.lvars.length)
                                                    throw `Pattern capturing cannot be combined with hiding`;
                                                if (patt && !getVal)
                                                    throw `Match requested but no 'value' specified.`;
                                            case 'ELSE':
                                                const builder = this.CompChildNodes(childElm);
                                                caseList.push({ cond, patt, builder, childElm });
                                                atts.CheckNoAttsLeft();
                                                continue;
                                        }
                                    }
                                    catch (err) {
                                        throw OuterOpenTag(childElm) + err;
                                    }
                                    finally {
                                        this.RestoreContext(saved);
                                    }
                                }
                                bodyNodes.push(child);
                            }
                            if (getCond)
                                caseList.unshift({
                                    cond: getCond, patt: null,
                                    builder: this.CompChildNodes(srcElm, bodyNodes),
                                    childElm: srcElm
                                });
                            builder =
                                async function CASE(area) {
                                    const { env } = area, value = getVal && getVal(env);
                                    let choosenAlt = null;
                                    let matchResult;
                                    for (const alt of caseList)
                                        try {
                                            if ((!alt.cond || alt.cond(env))
                                                && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))) {
                                                choosenAlt = alt;
                                                break;
                                            }
                                        }
                                        catch (err) {
                                            throw OuterOpenTag(alt.childElm) + err;
                                        }
                                    if (bHiding) {
                                        for (const alt of caseList) {
                                            const { elmRange, childArea, bInit } = PrepareElement(alt.childElm, area);
                                            const bHidden = elmRange.node.hidden = alt != choosenAlt;
                                            if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                                await this.CallWithErrorHandling(alt.builder, alt.childElm, childArea);
                                        }
                                    }
                                    else {
                                        const { subArea, bInit } = PrepareArea(srcElm, area, '', 1, choosenAlt);
                                        if (choosenAlt && (bInit || !area.bNoChildBuilding)) {
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
                            if (this.whiteSpc == WhiteSpace.trim)
                                this.whiteSpc = WhiteSpace.keep;
                        }
                        break;
                    case 'for':
                    case 'foreach':
                        builder = this.CompFor(srcParent, srcElm, atts);
                        break;
                    case 'include':
                        {
                            const src = atts.get('src', true);
                            let C = new RCompiler(this);
                            C.FilePath = GetPath(src, this.FilePath);
                            const task = (async () => {
                                const textContent = await FetchText(src);
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html');
                                C.Compile(parsedContent.body, { bRunScripts: true }, false);
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
                    case 'import':
                        {
                            const src = atts.get('src', true);
                            const listImports = new Array();
                            const dummyEnv = NewEnv();
                            for (const child of srcElm.children) {
                                const signature = this.ParseSignature(child);
                                async function holdOn(area, args, mSlotTemplates, slotEnv) {
                                    const t0 = performance.now();
                                    await task;
                                    this.buildStart += performance.now() - t0;
                                    area.env = placeholder.constructEnv;
                                    for (const builder of placeholder.templates)
                                        await builder.call(this, area, args, mSlotTemplates, slotEnv);
                                }
                                const placeholder = { templates: [holdOn], constructEnv: dummyEnv };
                                listImports.push([signature, placeholder]);
                                this.AddConstruct(signature);
                            }
                            const C = new RCompiler();
                            C.FilePath = GetPath(src, this.FilePath);
                            C.Settings.bRunScripts = true;
                            const task = (async () => {
                                let promiseModule = Modules.get(src);
                                if (!promiseModule) {
                                    promiseModule = FetchText(src)
                                        .then(async (textContent) => {
                                        const parser = new DOMParser(), parsedContent = parser.parseFromString(textContent, 'text/html'), builder = C.CompChildNodes(parsedContent.body, undefined, true), env = NewEnv();
                                        await builder.call(this, { parent: parsedContent.body, start: null, bInit: true, env });
                                        return { Signatures: C.Constructs, ConstructDefs: env.constructDefs };
                                    });
                                    Modules.set(src, promiseModule);
                                }
                                const module = await promiseModule;
                                for (const [clientSig, placeholder] of listImports) {
                                    const { name } = clientSig, signature = module.Signatures.get(name);
                                    if (!signature)
                                        throw `<${name}> is missing in '${src}'`;
                                    if (!clientSig.IsCompatible(signature))
                                        throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signature.srcElm.outerHTML}`;
                                    const constructdef = module.ConstructDefs.get(name);
                                    placeholder.templates = constructdef.templates;
                                    placeholder.constructEnv = constructdef.constructEnv;
                                }
                            })();
                            builder = async function IMPORT({ env }) {
                                for (const [{ name }, constructDef] of listImports.values()) {
                                    const prevDef = env.constructDefs.get(name);
                                    env.constructDefs.set(name, constructDef);
                                    envActions.push(() => { env.constructDefs.set(name, prevDef); });
                                }
                            };
                        }
                        break;
                    case 'react':
                        {
                            this.MainC.bHasReacts = true;
                            const getRvars = this.compAttrExprList(atts, 'on', false);
                            const getHash = this.CompAttrExpr(atts, 'hash');
                            const bodyBuilder = this.CompChildNodes(srcElm);
                            builder = this.GetREACT(srcElm, '', bodyBuilder, getRvars);
                            if (getHash) {
                                const b = builder;
                                builder = async function HASH(area) {
                                    const hash = getHash(area.env);
                                    const { subArea, range } = PrepareArea(srcElm, area, 'hash');
                                    if (hash !== range.value) {
                                        range.value = hash;
                                        await b.call(this, subArea);
                                    }
                                };
                            }
                        }
                        break;
                    case 'rhtml':
                        {
                            this.whiteSpc = WhiteSpace.trim;
                            const bodyBuilder = this.CompChildNodes(srcElm);
                            const imports = this.CompAttrExpr(atts, 'imports');
                            const { preModifiers } = this.CompAttributes(atts);
                            builder = async function RHTML(area) {
                                const tempElm = document.createElement('rhtml');
                                await bodyBuilder.call(this, { parent: tempElm, env: area.env, range: null });
                                const result = tempElm.innerText;
                                const { elmRange, bInit } = PrepareElement(srcElm, area, 'rhtml-rhtml'), elm = elmRange.node;
                                ApplyModifiers(elm, preModifiers, area.env, bInit);
                                if (area.prevR || result != elmRange.result) {
                                    elmRange.result = result;
                                    const shadowRoot = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                                    try {
                                        tempElm.innerHTML = result;
                                        if (elmRange.hdrElms) {
                                            for (const elm of elmRange.hdrElms)
                                                elm.remove();
                                            elmRange.hdrElms = null;
                                        }
                                        const R = new RCompiler();
                                        ;
                                        (R.StyleRoot = shadowRoot).innerHTML = '';
                                        R.Compile(tempElm, { bRunScripts: true }, false);
                                        elmRange.hdrElms = R.AddedHeaderElements;
                                        const subArea = { parent: shadowRoot, range: null, env: NewEnv(), parentR: new Range(null, 'Shadow') };
                                        await R.InitialBuild(subArea);
                                        this.builtNodeCount += R.builtNodeCount;
                                    }
                                    catch (err) {
                                        shadowRoot.appendChild(createErrorNode(`Compile error: ${err}`));
                                    }
                                }
                            };
                        }
                        break;
                    case 'script':
                        builder = this.CompScript(srcParent, srcElm, atts);
                        break;
                    case 'style':
                        this.CompStyle(srcElm);
                        break;
                    case 'component':
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
        for (const { attName, rvars } of mapReacts)
            builder = this.GetREACT(srcElm, attName, builder, rvars);
        if (builder)
            return [builder, srcElm];
        return null;
    }
    GetREACT(srcElm, attName, builder, rvars) {
        this.MainC.bHasReacts = true;
        const updateBuilder = (attName == 'thisreactson'
            ? async function reacton(area) {
                area.bNoChildBuilding = true;
                await builder.call(this, area);
            }
            : builder);
        return async function REACT(area) {
            const { range, subArea, bInit } = PrepareArea(srcElm, area, attName, true);
            await builder.call(this, subArea);
            if (bInit) {
                const subscriber = this.Subscriber(subArea, updateBuilder, range.child);
                for (const getRvar of rvars) {
                    const rvar = getRvar(area.env);
                    rvar.Subscribe(subscriber);
                }
            }
        };
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
                const errorNode = area.parent.insertBefore(createErrorNode(message), area.range?.First);
                if (range)
                    range.errorNode = errorNode;
            }
        }
    }
    CompScript(srcParent, srcElm, atts) {
        const bModule = atts.get('type') == 'module', bNoModule = atts.get('nomodule') != null;
        let src = atts.get('src');
        let builder;
        if (bNoModule || this.Settings.bRunScripts) {
            let script = srcElm.text + '\n';
            const defines = atts.get('defines');
            const lvars = [];
            if (defines)
                for (const name of defines.split(','))
                    lvars.push({ name, init: this.NewVar(name) });
            let exports;
            builder = async function SCRIPT({ env }) {
                if (!(bModule || bNoModule || defines || !this.clone)) {
                    if (!exports) {
                        const e = srcElm.cloneNode(true);
                        document.head.appendChild(e);
                        this.AddedHeaderElements.push(e);
                        exports = {};
                    }
                }
                else if (bModule) {
                    if (!exports) {
                        if (src)
                            exports = await import(src);
                        else
                            try {
                                script = script.replace(/(\sfrom\s*['"])(\.\.?\/)/g, `$1${this.FilePath}$2`);
                                src = URL.createObjectURL(new Blob([script], { type: 'application/javascript' }));
                                exports = await import(src);
                            }
                            finally {
                                URL.revokeObjectURL(src);
                            }
                    }
                    for (const { name, init } of lvars) {
                        if (!(name in exports))
                            throw `'${name}' is not exported by this script`;
                        init(env)(exports[name]);
                    }
                }
                else {
                    if (!exports) {
                        if (src)
                            script = await FetchText(src);
                        exports = gEval(`'use strict'\n;${script};[${defines}]\n`);
                    }
                    let i = 0;
                    for (const { init } of lvars)
                        init(env)(exports[i++]);
                }
            };
        }
        atts.clear();
        return builder;
    }
    CompFor(srcParent, srcElm, atts) {
        const varName = atts.get('let');
        let indexName = atts.get('index');
        if (indexName == '')
            indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) {
                let prevName = atts.get('previous');
                if (prevName == '')
                    prevName = 'previous';
                let nextName = atts.get('next');
                if (nextName == '')
                    nextName = 'next';
                const getRange = this.CompAttrExpr(atts, 'of', true), bReactive = CBool(atts.get('updateable') ?? atts.get('reactive')), getUpdatesTo = this.CompAttrExpr(atts, 'updates'), initVar = this.NewVar(varName), initIndex = this.NewVar(indexName), initPrevious = this.NewVar(prevName), initNext = this.NewVar(nextName), getKey = this.CompAttrExpr(atts, 'key'), getHash = this.CompAttrExpr(atts, 'hash'), bodyBuilder = this.CompChildNodes(srcElm);
                return async function FOR(area) {
                    const { range, subArea } = PrepareArea(srcElm, area, '', true), { parent, env } = subArea, savedEnv = SaveEnv();
                    try {
                        const keyMap = range.value ||= new Map(), newMap = new Map(), setVar = initVar(env), iterator = getRange(env), setIndex = initIndex(env);
                        if (iterator) {
                            if (!(iterator[Symbol.iterator] || iterator[Symbol.asyncIterator]))
                                throw `[of]: Value (${iterator}) is not iterable`;
                            let index = 0;
                            for await (const item of iterator) {
                                setVar(item);
                                setIndex(index);
                                const hash = getHash && getHash(env);
                                const key = getKey ? getKey(env) : hash;
                                if (key != null && newMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                newMap.set(key ?? {}, { item, hash, index });
                                index++;
                            }
                        }
                        let nextChild = range.child;
                        function RemoveStaleItems() {
                            let key;
                            while (nextChild && !newMap.has(key = nextChild.key)) {
                                if (key != null)
                                    keyMap.delete(key);
                                try {
                                    for (const node of nextChild.Nodes())
                                        parent.removeChild(node);
                                }
                                catch { }
                                nextChild.prev = null;
                                nextChild = nextChild.next;
                            }
                        }
                        const setPrevious = initPrevious(env), setNext = initNext(env), nextIterator = nextName ? newMap.values() : null;
                        let prevItem = null, nextItem, prevRange = null, childArea;
                        subArea.parentR = range;
                        if (nextIterator)
                            nextIterator.next();
                        RemoveStaleItems();
                        for (const [key, { item, hash, index }] of newMap) {
                            if (nextIterator)
                                nextItem = nextIterator.next().value?.item;
                            let childRange = keyMap.get(key), bInit = !childRange;
                            if (bInit) {
                                subArea.range = null;
                                subArea.prevR = prevRange;
                                subArea.before = nextChild?.First || range.endMark;
                                ;
                                ({ range: childRange, subArea: childArea } = PrepareArea(null, subArea, `${varName}(${index})`, true));
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, childRange);
                                }
                                childRange.key = key;
                            }
                            else {
                                if (childRange.fragm) {
                                    const nextNode = nextChild?.First || range.endMark;
                                    parent.insertBefore(childRange.fragm, nextNode);
                                    childRange.fragm = null;
                                }
                                else
                                    while (true) {
                                        if (nextChild == childRange)
                                            nextChild = nextChild.next;
                                        else {
                                            const nextIndex = newMap.get(nextChild.key).index;
                                            if (nextIndex > index + 2) {
                                                const fragm = nextChild.fragm = document.createDocumentFragment();
                                                for (const node of nextChild.Nodes())
                                                    fragm.appendChild(node);
                                                nextChild = nextChild.next;
                                                RemoveStaleItems();
                                                continue;
                                            }
                                            childRange.prev.next = childRange.next;
                                            if (childRange.next)
                                                childRange.next.prev = childRange.prev;
                                            const nextNode = nextChild?.First || range.endMark;
                                            for (const node of childRange.Nodes())
                                                parent.insertBefore(node, nextNode);
                                        }
                                        break;
                                    }
                                childRange.text = `${varName}(${index})`;
                                if (prevRange)
                                    prevRange.next = childRange;
                                else
                                    range.child = childRange;
                                subArea.range = childRange;
                                childArea = PrepareArea(null, subArea, '', true).subArea;
                                subArea.parentR = null;
                            }
                            childRange.prev = prevRange;
                            prevRange = childRange;
                            if (hash == null
                                || hash != childRange.hash
                                    && (childRange.hash = hash, true)) {
                                let rvar;
                                if (bReactive) {
                                    if (item === childRange.rvar)
                                        rvar = item;
                                    else {
                                        rvar = this.RVAR_Light(item, getUpdatesTo && [getUpdatesTo(env)]);
                                        if (childRange.rvar)
                                            rvar._Subscribers = childRange.rvar._Subscribers;
                                        childRange.rvar = rvar;
                                    }
                                }
                                setVar(rvar || item);
                                setIndex(index);
                                setPrevious(prevItem);
                                if (nextIterator)
                                    setNext(nextItem);
                                await bodyBuilder.call(this, childArea);
                                if (bReactive)
                                    rvar.Subscribe(this.Subscriber(childArea, bodyBuilder, childRange.child));
                            }
                            prevItem = item;
                            RemoveStaleItems();
                        }
                        if (prevRange)
                            prevRange.next = null;
                        else
                            range.child = null;
                    }
                    finally {
                        RestoreEnv(savedEnv);
                    }
                };
            }
            else {
                const slotName = atts.get('of', true, true).toLowerCase();
                const slot = this.Constructs.get(slotName);
                if (!slot)
                    throw `Missing attribute [let]`;
                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompChildNodes(srcElm);
                return async function FOREACH_Slot(area) {
                    const { subArea } = PrepareArea(srcElm, area);
                    const env = subArea.env;
                    const saved = SaveEnv();
                    const slotDef = env.constructDefs.get(slotName);
                    try {
                        const setIndex = initIndex(area.env);
                        let index = 0;
                        for (const slotBuilder of slotDef.templates) {
                            setIndex(index++);
                            env.constructDefs.set(slotName, { templates: [slotBuilder], constructEnv: slotDef.constructEnv });
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
                        ? (m[1] == '#' ? this.CompJavaScript(attr.value, attr.name) : this.CompInterpStr(attr.value, attr.name))
                        : m[3] ? (_) => undefined
                            : null
                });
        }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.localName, this.ParseSignature(elmSlot));
        return signature;
    }
    CompComponent(srcParent, srcElm, atts) {
        const builders = [], bEncapsulate = CBool(atts.get('encapsulate')), styles = [], saveWS = this.whiteSpc;
        let signature, elmTemplate;
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
        const { name } = signature, templates = [
            this.CompTemplate(signature, elmTemplate.content, elmTemplate, false, bEncapsulate, styles)
        ];
        this.whiteSpc = saveWS;
        return (async function COMPONENT(area) {
            for (const [bldr, srcNode] of builders)
                await this.CallWithErrorHandling(bldr, srcNode, area);
            const construct = { templates, constructEnv: undefined }, { env } = area, prevDef = env.constructDefs.get(name);
            env.constructDefs.set(name, construct);
            construct.constructEnv = CloneEnv(env);
            envActions.push(() => { env.constructDefs.set(name, prevDef); });
        });
    }
    CompTemplate(signat, contentNode, srcElm, bNewNames, bEncaps, styles, atts) {
        const names = [], saved = this.SaveContext(), bCheckAtts = !atts;
        try {
            if (bCheckAtts)
                atts = new Atts(srcElm);
            for (const param of signat.Parameters)
                names.push((atts.get(`#${param.name}`) ?? atts.get(param.name, bNewNames)) || param.name);
            const { name, RestParam } = signat;
            if (RestParam?.name)
                names.push(atts.get(`...${RestParam.name}`, bNewNames) || RestParam.name);
            for (const S of signat.Slots.values())
                this.AddConstruct(S);
            if (bCheckAtts)
                atts.CheckNoAttsLeft();
            const lvars = names.map(name => this.NewVar(name)), builder = this.CompChildNodes(contentNode), customName = /^[A-Z].*-/.test(name) ? name : `rhtml-${name}`;
            return async function TEMPLATE(area, args, mSlotTemplates, slotEnv) {
                const saved = SaveEnv(), { env } = area;
                try {
                    for (const [slotName, instanceBuilders] of mSlotTemplates) {
                        const savedDef = env.constructDefs.get(slotName);
                        envActions.push(() => { env.constructDefs.set(slotName, savedDef); });
                        env.constructDefs.set(slotName, { templates: instanceBuilders, constructEnv: slotEnv });
                    }
                    let i = 0;
                    for (const lvar of lvars) {
                        let arg = args[i], dflt;
                        if (arg === undefined && (dflt = signat.Parameters[i].pDefault))
                            arg = dflt(env);
                        lvar(env)(arg);
                        i++;
                    }
                    if (bEncaps) {
                        const { elmRange, childArea, bInit } = PrepareElement(srcElm, area, customName), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                        if (bInit)
                            for (const style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        if (args[i])
                            ApplyModifier(elm, ModifType.RestArgument, null, args[i], bInit);
                        childArea.parent = shadow;
                        area = childArea;
                    }
                    await builder.call(this, area);
                }
                finally {
                    RestoreEnv(saved);
                }
            };
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} template: ${err}`;
        }
        finally {
            this.RestoreContext(saved);
        }
    }
    CompInstance(srcParent, srcElm, atts, signature) {
        const { name } = signature, getArgs = [], slotBuilders = new Map();
        for (const { name, pDefault } of signature.Parameters)
            getArgs.push(this.CompParameter(atts, name, !pDefault));
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);
        let slotElm, Slot;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE
                && (Slot = signature.Slots.get((slotElm = node).localName))
                && slotElm.localName != 'content') {
                slotBuilders.get(slotElm.localName).push(this.CompTemplate(Slot, slotElm, slotElm, true));
                srcElm.removeChild(node);
            }
        const contentSlot = signature.Slots.get('content');
        if (contentSlot)
            slotBuilders.get('content').push(this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts));
        const preModifiers = signature.RestParam ? this.CompAttributes(atts).preModifiers : null;
        atts.CheckNoAttsLeft();
        this.whiteSpc = WhiteSpace.keep;
        return async function INSTANCE(area) {
            const { subArea } = PrepareArea(srcElm, area), { env } = area, { templates: instanceBuilders, constructEnv } = env.constructDefs.get(name), args = [];
            for (const getArg of getArgs)
                args.push(getArg ? getArg(env) : undefined);
            if (signature.RestParam) {
                const rest = [];
                for (const { modType, name, depValue } of preModifiers)
                    rest.push({ modType, name, value: depValue(env) });
                args.push(rest);
            }
            const slotEnv = signature.Slots.size ? CloneEnv(env) : null;
            subArea.env = constructEnv;
            for (const parBuilder of instanceBuilders)
                await parBuilder.call(this, subArea, args, slotBuilders, slotEnv);
        };
    }
    CompHTMLElement(srcElm, atts) {
        const name = srcElm.localName.replace(/\.+$/, ''), saveWs = this.whiteSpc;
        const ws = name == 'pre' ? WhiteSpace.preserve : RCompiler.regTrimmable.test(name) ? WhiteSpace.trim : WhiteSpace.keep;
        const { preModifiers, postModifiers } = this.CompAttributes(atts);
        if (ws != WhiteSpace.keep)
            this.whiteSpc = ws;
        const childnodesBuilder = this.CompChildNodes(srcElm);
        if (ws == WhiteSpace.trim)
            this.whiteSpc = ws;
        else if (ws == WhiteSpace.preserve && saveWs != WhiteSpace.preserve)
            this.whiteSpc = WhiteSpace.keep;
        const builder = async function ELEMENT(area) {
            const { elmRange: { node }, childArea, bInit } = PrepareElement(srcElm, area, name);
            if (!area.bNoChildBuilding)
                await childnodesBuilder.call(this, childArea);
            node.removeAttribute('class');
            ApplyModifiers(node, preModifiers, area.env);
            ApplyModifiers(node, postModifiers, area.env, bInit);
        };
        builder.ws = ws;
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
                        depValue: this.CompJavaScript(`function ${attName}(){${attValue}\n}`, attName)
                    });
                else if (m = /^on(.*)$/i.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Event,
                        name: CapitalizeProp(m[0]),
                        depValue: this.CompJavaScript(`function ${attName}(event){${attValue}\n}`, attName)
                    });
                else if (m = /^#class:(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Class, name: m[1],
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^#style\.(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^style\.(.*)$/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompInterpStr(attValue)
                    });
                else if (attName == '+style')
                    preModifiers.push({
                        modType: ModifType.AddToStyle, name: null,
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^#(.*)/.exec(attName))
                    preModifiers.push({
                        modType: ModifType.Prop, name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (attName == "+class")
                    preModifiers.push({
                        modType: ModifType.AddToClassList, name: null,
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attName)) {
                    const propName = CapitalizeProp(m[3]);
                    try {
                        const setter = this.CompJavaScript(`function(){const ORx=this.${propName};if(${attValue}!==ORx)${attValue}=ORx}`, attName);
                        if (m[1] == '@')
                            preModifiers.push({ modType: ModifType.Prop, name: propName, depValue: this.CompJavaScript(attValue, attName) });
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
                        depValue: this.CompInterpStr(attValue)
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
    }
    CompInterpStr(data, name) {
        const generators = [], regIS = /(?<![\\$])\$?\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/gs;
        let isTrivial = true, last = '';
        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data), fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed)
                generators.push(last = fixed.replace(/\\([${}\\])/g, '$1'));
            if (m[1]) {
                generators.push(this.CompJavaScript(m[1], name, '{}'));
                isTrivial = false;
                last = '';
            }
        }
        let dep;
        if (isTrivial) {
            const result = generators.join('');
            dep = () => result;
            dep.fixed = result;
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
        dep.bThis = false;
        dep.last = last;
        return dep;
    }
    CompPattern(patt, url) {
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
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CompParameter(atts, attName, bRequired) {
        const value = atts.get(attName);
        return (value == null ? this.CompAttrExpr(atts, attName, bRequired)
            : /^on/.test(attName) ? this.CompJavaScript(`function ${attName}(event){${value}\n}`, attName)
                : this.CompInterpStr(value, attName));
    }
    CompAttrExpr(atts, attName, bRequired) {
        return this.CompJavaScript(atts.get(attName, bRequired, true), attName);
    }
    CompJavaScript(expr, descript, delims = '""') {
        if (expr == null)
            return null;
        const bThis = /\bthis\b/.test(expr), depExpr = bThis ?
            `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
            : `'use strict';([${this.context}])=>(${expr}\n)`, errorInfo = `${descript ? `[${descript}] ` : ''}${delims[0]}${Abbreviate(expr, 60)}${delims[1]}: `;
        try {
            const routine = gEval(depExpr), depValue = (bThis
                ? function (env) {
                    try {
                        return routine.call(this, env);
                    }
                    catch (err) {
                        throw errorInfo + err;
                    }
                }
                : (env) => {
                    try {
                        return routine(env);
                    }
                    catch (err) {
                        throw errorInfo + err;
                    }
                });
            depValue.bThis = bThis;
            return depValue;
        }
        catch (err) {
            throw errorInfo + err;
        }
    }
    CompName(name) {
        const i = this.ContextMap.get(name);
        if (i === undefined)
            throw `Unknown name '${name}'`;
        return env => env[i];
    }
    compAttrExprList(atts, attName, bRequired) {
        const list = atts.get(attName, bRequired, true);
        return list ? list.split(',').map(expr => this.CompJavaScript(expr, attName)) : [];
    }
}
RCompiler.iNum = 0;
RCompiler.preMods = ['reacton', 'reactson', 'thisreactson'];
RCompiler.regTrimmable = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul)$/;
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
class _RVAR {
    constructor(MainC, globalName, initialValue, store, storeName) {
        this.MainC = MainC;
        this.store = store;
        this.storeName = storeName;
        this.Subscribers = new Set();
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
    get U() {
        if (!bReadOnly)
            this.SetDirty();
        return this._Value;
    }
    set U(t) { this.V = t; }
    SetDirty() {
        if (this.store)
            this.MainC.DirtyVars.add(this);
        for (const sub of this.Subscribers)
            if (sub.before.isConnected)
                this.MainC.AddDirty(sub);
            else
                this.Subscribers.delete(sub);
        this.MainC.RUpdate();
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
    + '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|line|margin|max|min|node|offset|outer'
    + '|outline|overflow|owner|padding|parent|read|right|size|rule|scroll|selected|table|tab(?=index)|text|top|value|variant)';
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
    const response = await gFetch(url);
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
const _range = globalThis.range = function* range(from, upto, step = 1) {
    if (upto === undefined) {
        upto = from;
        from = 0;
    }
    for (let i = from; i < upto; i += step)
        yield i;
};
export { _range as range };
function GetPath(url, base) {
    const U = new URL(url, base);
    return U.origin + U.pathname.replace(/[^/]*$/, '');
}
export const docLocation = RVAR('docLocation', location);
function SetLocation() {
    const subpath = location.pathname.substr(RootPath.length);
    if (docLocation.subpath != null && subpath != docLocation.subpath)
        docLocation.SetDirty();
    docLocation.subpath = subpath;
}
window.addEventListener('popstate', SetLocation);
export const reroute = globalThis.reroute = (arg) => {
    history.pushState(null, null, typeof arg == 'string' ? arg : arg.target.href);
    SetLocation();
    return false;
};
