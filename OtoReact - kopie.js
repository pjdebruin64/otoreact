var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
const defaultSettings = {
    bAbortOnError: false,
    bShowErrors: true,
    bStripSpaces: true,
    bRunScripts: false,
    bBuild: true,
    rootPattern: null,
};
let RootPath = null;
export function RCompile(elm, settings) {
    try {
        const { rootPattern } = settings = Object.assign(Object.assign({}, defaultSettings), settings);
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
        R.ToBuild.push({ parent: elm.parentElement, start: elm, bInit: true, env: NewEnv(), });
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
;
;
;
class Signature {
    constructor(srcElm) {
        this.srcElm = srcElm;
        this.Parameters = [];
        this.RestParam = null;
        this.Slots = new Map();
        this.tagName = srcElm.tagName;
    }
    IsCompatible(sig) {
        var _a;
        let result = sig
            && this.tagName == sig.tagName
            && this.Parameters.length <= sig.Parameters.length;
        const iter = sig.Parameters.values();
        for (const thisParam of this.Parameters) {
            const sigParam = iter.next().value;
            result && (result = thisParam.name == sigParam.name && (!thisParam.pDefault || !!sigParam.pDefault));
        }
        result && (result = !this.RestParam || this.RestParam.name == ((_a = sig.RestParam) === null || _a === void 0 ? void 0 : _a.name));
        for (let [slotname, slotSig] of this.Slots)
            result && (result = slotSig.IsCompatible(sig.Slots.get(slotname)));
        return result;
    }
}
const globalEval = eval, globalFetch = fetch;
function tryFetch(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield globalFetch(url);
        if (!response.ok)
            throw `GET '${url}' returned ${response.status} ${response.statusText}`;
        return response;
    });
}
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
    ModifType[ModifType["PseudoEvent"] = 8] = "PseudoEvent";
})(ModifType || (ModifType = {}));
;
function ApplyModifier(elm, modType, name, val) {
    var _a;
    switch (modType) {
        case ModifType.Attr:
            elm.setAttribute(name, (_a = val) !== null && _a !== void 0 ? _a : '');
            break;
        case ModifType.Prop:
            if (val != null)
                elm[name] = val;
            else
                delete elm[name];
            break;
        case ModifType.Event:
            elm[name] = val;
            break;
        case ModifType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModifType.Style:
            if (val !== undefined)
                elm.style[name] = val !== null && val !== void 0 ? val : '';
            break;
        case ModifType.AddToStyle:
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
                ApplyModifier(elm, modType, name, value);
            break;
    }
}
function ApplyPreModifiers(elm, preModifiers, env) {
    for (const { modType, name, depValue } of preModifiers) {
        try {
            const value = depValue(env);
            ApplyModifier(elm, modType, name, value);
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
let iNum = 0;
class RCompiler {
    constructor(clone) {
        this.instanceNum = iNum++;
        this.restoreActions = [];
        this.ToBuild = [];
        this.AllRegions = [];
        this.bTrimLeft = false;
        this.bTrimRight = false;
        this.bCompiled = false;
        this.bHasReacts = false;
        this.DirtySubs = new Map();
        this.bUpdating = false;
        this.handleUpdate = null;
        this.sourceNodeCount = 0;
        this.builtNodeCount = 0;
        this.preMods = ['reacton', 'reactson', 'thisreactson'];
        this.Context = clone ? clone.Context.slice() : [];
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings = clone ? Object.assign({}, clone.Settings) : Object.assign({}, defaultSettings);
        this.AddedHeaderElements = clone ? clone.AddedHeaderElements : [];
        this.StyleRoot = clone ? clone.StyleRoot : document.head;
        this.StyleBefore = clone === null || clone === void 0 ? void 0 : clone.StyleBefore;
    }
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
            i = this.Context.push(name) - 1;
            this.ContextMap.set(name, i);
            this.restoreActions.push(() => this.ContextMap.delete(this.Context.pop()));
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
        this.Settings = Object.assign(Object.assign({}, defaultSettings), settings);
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
    Build(reg) {
        return __awaiter(this, void 0, void 0, function* () {
            const savedRCompiler = RHTML, { parent, start } = reg;
            RHTML = this;
            yield this.Builder(reg);
            this.AllRegions.push(reg.marker
                ? { parent, marker: reg.marker, builder: this.Builder, env: NewEnv() }
                : { parent, start, builder: this.Builder, env: NewEnv() });
            RHTML = savedRCompiler;
        });
    }
    AddDirty(sub) {
        this.DirtySubs.set((sub.marker || sub.start), sub);
    }
    RUpdate() {
        if (!this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 0);
    }
    ;
    DoUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.bCompiled || this.bUpdating)
                return;
            this.bUpdating = true;
            let savedRCompiler = RHTML;
            try {
                if (this.ToBuild.length) {
                    this.buildStart = performance.now();
                    this.builtNodeCount = 0;
                    for (const reg of this.ToBuild)
                        yield this.Build(reg);
                    console.log(`Built ${this.builtNodeCount} nodes in ${(performance.now() - this.buildStart).toFixed(1)} ms`);
                    this.ToBuild = [];
                }
                if (!this.bHasReacts)
                    for (const s of this.AllRegions)
                        this.AddDirty(s);
                if (this.DirtySubs.size) {
                    RHTML = this;
                    this.buildStart = performance.now();
                    this.builtNodeCount = 0;
                    for (const { parent, marker, start, builder, env } of this.DirtySubs.values()) {
                        try {
                            yield builder.call(this, { parent, start: start || (marker === null || marker === void 0 ? void 0 : marker.nextSibling) || parent.firstChild, env, });
                        }
                        catch (err) {
                            const msg = `ERROR: ${err}`;
                            console.log(msg);
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
        });
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
                        const str = srcNode.data
                            .replace(/^[ \t\r\n]+/g, this.bTrimLeft ? '' : ' ')
                            .replace(/\[ \t\r\n]+$/, ' ');
                        if (str != '') {
                            this.bTrimLeft = / $/.test(str);
                            const getText = this.CompInterpolatedString(str);
                            function Text(region) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    const { start, lastM, bInit } = region, content = getText(region.env);
                                    let text;
                                    if (bInit && start != srcNode)
                                        text = region.parent.insertBefore(document.createTextNode(content), start);
                                    else {
                                        (text = start).data = content;
                                        region.start = start.nextSibling;
                                    }
                                    if (bInit)
                                        FillNextM(region, text);
                                });
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
        return builders.length == 0 ? () => __awaiter(this, void 0, void 0, function* () { }) :
            function ChildNodes(region) {
                return __awaiter(this, void 0, void 0, function* () {
                    const savedEnv = SaveEnv();
                    try {
                        for (const [builder, node] of builders)
                            yield this.CallWithErrorHandling(builder, node, region);
                        this.builtNodeCount += builders.length;
                    }
                    finally {
                        if (!bNorestore)
                            RestoreEnv(savedEnv);
                    }
                });
            };
    }
    CompElement(srcParent, srcElm, bBlockLevel) {
        var _a, _b;
        const atts = new Atts(srcElm);
        let builder = null;
        const mapReacts = [];
        for (const attName of this.preMods) {
            const val = atts.get(attName);
            if (val)
                mapReacts.push({ attName, rvars: val.split(',').map(expr => this.CompJavaScript(expr)) });
        }
        labelNoCheck: try {
            const construct = this.Constructs.get(srcElm.tagName);
            if (construct)
                builder = this.CompConstructInstance(srcParent, srcElm, atts, construct);
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
                            builder = function DEFINE(region) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    const subRegion = PrepareRegion(srcElm, region, undefined, undefined, varName);
                                    const { marker } = subRegion;
                                    if (region.bInit || bReact) {
                                        const value = getValue && getValue(region.env);
                                        marker.rValue = rvarName
                                            ? new _RVAR(this, null, value, getStore && getStore(region.env), rvarName)
                                            : value;
                                    }
                                    newVar(region.env)(marker.rValue);
                                    yield subBuilder.call(this, subRegion);
                                });
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
                                                    const lvars = ((_a = atts.get('captures')) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
                                                    patt = { regex: new RegExp(pattern, 'i'), lvars: lvars.map(this.NewVar.bind(this)) };
                                                }
                                                else
                                                    patt = null;
                                                if (bHiding && ((_b = patt === null || patt === void 0 ? void 0 : patt.lvars) === null || _b === void 0 ? void 0 : _b.length))
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
                                function CASE(region) {
                                    return __awaiter(this, void 0, void 0, function* () {
                                        const { bInit, env } = region;
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
                                            const subRegion = PrepareRegion(srcElm, region, null, bInit);
                                            if (bInit && subRegion.start == srcElm) {
                                                subRegion.start = srcElm.firstChild;
                                                srcElm.replaceWith(...srcElm.childNodes);
                                            }
                                            for (const alt of caseList) {
                                                const bHidden = alt != choosenAlt;
                                                const elm = PrepareElement(alt.childElm, subRegion);
                                                elm.hidden = bHidden;
                                                if ((!bHidden || bInit) && !region.bNoChildBuilding)
                                                    yield this.CallWithErrorHandling(alt.builder, alt.childElm, { parent: elm, start: elm.firstChild, bInit, env });
                                            }
                                        }
                                        else {
                                            const subregion = PrepareRegion(srcElm, region, choosenAlt, bInit);
                                            if (choosenAlt) {
                                                const saved = SaveEnv();
                                                try {
                                                    if (choosenAlt.patt) {
                                                        let i = 1;
                                                        for (const lvar of choosenAlt.patt.lvars)
                                                            lvar(env)((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[i++]));
                                                    }
                                                    yield this.CallWithErrorHandling(choosenAlt.builder, choosenAlt.childElm, subregion);
                                                }
                                                finally {
                                                    RestoreEnv(saved);
                                                }
                                            }
                                        }
                                    });
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
                            const task = (() => __awaiter(this, void 0, void 0, function* () {
                                const textContent = yield (yield tryFetch(src)).text();
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html');
                                C.Compile(parsedContent.body, this.Settings, false);
                                this.bHasReacts || (this.bHasReacts = C.bHasReacts);
                            }))();
                            builder =
                                function INCLUDE(region) {
                                    return __awaiter(this, void 0, void 0, function* () {
                                        const subregion = PrepareRegion(srcElm, region);
                                        const t0 = performance.now();
                                        yield task;
                                        this.buildStart += performance.now() - t0;
                                        C.builtNodeCount = 0;
                                        yield C.Builder(subregion);
                                        this.builtNodeCount += C.builtNodeCount;
                                    });
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
                                const holdOn = function holdOn(region, args, mapSlotBuilders, slotEnv) {
                                    return __awaiter(this, void 0, void 0, function* () {
                                        const t0 = performance.now();
                                        yield task;
                                        this.buildStart += performance.now() - t0;
                                        region.env = placeholder.constructEnv;
                                        for (const builder of placeholder.instanceBuilders)
                                            yield builder.call(this, region, args, mapSlotBuilders, slotEnv);
                                    });
                                };
                                const placeholder = { instanceBuilders: [holdOn], constructEnv: dummyEnv };
                                listImports.push([signature, placeholder]);
                                this.AddConstruct(signature);
                            }
                            const compiler = new RCompiler();
                            compiler.Settings.bRunScripts = true;
                            const task = (() => __awaiter(this, void 0, void 0, function* () {
                                let promiseModule = Modules.get(src);
                                if (!promiseModule) {
                                    promiseModule = tryFetch(src)
                                        .then((response) => __awaiter(this, void 0, void 0, function* () {
                                        const textContent = yield response.text();
                                        const parser = new DOMParser();
                                        const parsedContent = parser.parseFromString(textContent, 'text/html');
                                        const builder = compiler.CompChildNodes(parsedContent.body, true, undefined, true);
                                        this.bHasReacts || (this.bHasReacts = compiler.bHasReacts);
                                        const env = NewEnv();
                                        yield builder.call(this, { parent: parsedContent.body, start: null, bInit: true, env });
                                        return { Signatures: compiler.Constructs, ConstructDefs: env.constructDefs };
                                    }));
                                    Modules.set(src, promiseModule);
                                }
                                const module = yield promiseModule;
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
                            }))();
                            srcParent.removeChild(srcElm);
                            builder = function IMPORT({ env }) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    for (const [{ tagName: TagName }, constructDef] of listImports.values()) {
                                        const prevDef = env.constructDefs.get(TagName);
                                        env.constructDefs.set(TagName, constructDef);
                                        envActions.push(() => { env.constructDefs.set(TagName, prevDef); });
                                    }
                                });
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
                            builder = function REACT(region) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    let subregion = PrepareRegion(srcElm, region);
                                    if (subregion.bInit) {
                                        if (subregion.start == srcElm) {
                                            subregion.start = srcElm.firstChild;
                                            srcElm.replaceWith(...srcElm.childNodes);
                                        }
                                        const subscriber = {
                                            parent: subregion.parent, marker: subregion.marker,
                                            builder: bodyBuilder,
                                            env: CloneEnv(subregion.env),
                                        };
                                        for (const getRvar of getDependencies) {
                                            const rvar = getRvar(subregion.env);
                                            rvar.Subscribe(subscriber);
                                        }
                                    }
                                    yield bodyBuilder.call(this, subregion);
                                });
                            };
                        }
                        break;
                    case 'RHTML':
                        {
                            const bodyBuilder = this.CompChildNodes(srcElm, bBlockLevel);
                            srcParent.removeChild(srcElm);
                            let preModifiers;
                            preModifiers = this.CompAttributes(atts).preModifiers;
                            builder = function RHTML(region) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    const tempElm = document.createElement('RHTML');
                                    yield bodyBuilder.call(this, { parent: tempElm, start: null, env: region.env, bInit: true });
                                    const result = tempElm.innerText;
                                    let { bInit } = region;
                                    const elm = PrepareElement(srcElm, region, 'rhtml-rhtml');
                                    ApplyPreModifiers(elm, preModifiers, region.env);
                                    const shadowRoot = bInit
                                        ? elm.attachShadow({ mode: 'open' }) : elm.shadowRoot;
                                    if (bInit || result != elm['rResult']) {
                                        elm['rResult'] = result;
                                        shadowRoot.innerHTML = '';
                                        tempElm.innerHTML = result;
                                        const R = new RCompiler();
                                        R.StyleRoot = shadowRoot;
                                        try {
                                            R.Compile(tempElm, { bRunScripts: true }, false);
                                            const subregion = PrepareRegion(srcElm, { parent: shadowRoot, start: null, bInit: true, env: NewEnv() });
                                            R.StyleBefore = subregion.marker;
                                            yield R.Build(subregion);
                                            this.builtNodeCount += R.builtNodeCount;
                                        }
                                        catch (err) {
                                            shadowRoot.appendChild(createErrorNode(`Compile error: ${err}`));
                                        }
                                    }
                                });
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
            builder = function REACT(region) {
                return __awaiter(this, void 0, void 0, function* () {
                    let subregion = PrepareRegion(srcElm, region, null, null, attName);
                    yield bodyBuilder.call(this, subregion);
                    if (region.bInit) {
                        const subscriber = {
                            parent: region.parent, marker: subregion.marker,
                            builder: function reacton(reg) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    if (bNoChildUpdates && !reg.bInit)
                                        reg.bNoChildBuilding = true;
                                    yield this.CallWithErrorHandling(bodyBuilder, srcElm, reg);
                                    this.builtNodeCount++;
                                });
                            },
                            env: CloneEnv(region.env),
                        };
                        for (const getRvar of rvars) {
                            const rvar = getRvar(region.env);
                            rvar.Subscribe(subscriber);
                        }
                    }
                });
            };
            this.bHasReacts = true;
        }
        if (builder)
            return [builder, srcElm];
        return null;
    }
    CallWithErrorHandling(builder, srcNode, region) {
        return __awaiter(this, void 0, void 0, function* () {
            let start = region.start;
            if (start === null || start === void 0 ? void 0 : start.errorNode) {
                region.parent.removeChild(start.errorNode);
                start.errorNode = undefined;
            }
            try {
                yield builder.call(this, region);
            }
            catch (err) {
                const message = srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
                if (this.Settings.bAbortOnError)
                    throw message;
                console.log(message);
                if (this.Settings.bShowErrors) {
                    const errorNode = region.parent.insertBefore(createErrorNode(message), region.start);
                    if (start || (start = region.marker))
                        start.errorNode = errorNode;
                }
            }
        });
    }
    CompScript(srcParent, srcElm, atts) {
        srcParent.removeChild(srcElm);
        const type = atts.get('type');
        const src = atts.get('src');
        if (atts.get('nomodule') != null || this.Settings.bRunScripts) {
            let script = srcElm.text + '\n';
            if (type == 'module')
                throw `'type=module' is not supported (yet)`;
            const defines = atts.get('defines');
            if (src && defines)
                throw `'src' and'defines' cannot be combined (yet)`;
            const lvars = [];
            if (defines) {
                for (let name of defines.split(',')) {
                    lvars.push(this.NewVar(name));
                }
                const exports = globalEval(`'use strict'\n;${script};[${defines}]\n`);
                return function SCRIPT({ env }) {
                    return __awaiter(this, void 0, void 0, function* () {
                        let i = 0;
                        for (const lvar of lvars)
                            lvar(env)(exports[i++]);
                    });
                };
            }
            if (src) {
                const elm = document.createElement('script');
                elm.src = src;
                document.head.appendChild(elm);
                this.AddedHeaderElements.push(elm);
            }
            else
                globalEval(`'use strict';{${script}}`);
        }
        return null;
    }
    CompFor(srcParent, srcElm, atts, bBlockLevel) {
        var _a;
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
                const bReactive = CBool((_a = atts.get('updateable')) !== null && _a !== void 0 ? _a : atts.get('reactive'));
                const getUpdatesTo = this.CompAttrExpression(atts, 'updates');
                const initVar = this.NewVar(varName);
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);
                const initNext = this.NewVar(nextName);
                const getKey = this.CompAttrExpression(atts, 'key');
                const getHash = this.CompAttrExpression(atts, 'hash');
                const bodyBuilder = this.CompChildNodes(srcElm);
                srcParent.removeChild(srcElm);
                return function FOREACH(region) {
                    var e_1, _a;
                    var _b;
                    return __awaiter(this, void 0, void 0, function* () {
                        let subregion = PrepareRegion(srcElm, region, null, (getKey == null));
                        let { parent, marker, start, env } = subregion;
                        const savedEnv = SaveEnv();
                        try {
                            const keyMap = (region.bInit ? marker.keyMap = new Map() : marker.keyMap);
                            const newMap = new Map();
                            const setVar = initVar(env);
                            const iterator = getRange(env);
                            if (!iterator || typeof iterator[Symbol.iterator] != 'function')
                                throw `[of]: Value (${iterator}) is not iterable`;
                            try {
                                for (var iterator_1 = __asyncValues(iterator), iterator_1_1; iterator_1_1 = yield iterator_1.next(), !iterator_1_1.done;) {
                                    const item = iterator_1_1.value;
                                    setVar(item);
                                    const hash = getHash && getHash(env);
                                    const key = getKey ? getKey(env) : hash;
                                    if (key != null && newMap.has(key))
                                        throw `Key '${key}' is not unique`;
                                    newMap.set(key !== null && key !== void 0 ? key : {}, { item, hash });
                                }
                            }
                            catch (e_1_1) { e_1 = { error: e_1_1 }; }
                            finally {
                                try {
                                    if (iterator_1_1 && !iterator_1_1.done && (_a = iterator_1.return)) yield _a.call(iterator_1);
                                }
                                finally { if (e_1) throw e_1.error; }
                            }
                            function RemoveStaleItemsHere() {
                                let key;
                                while (start && start != region.start && !newMap.has(key = start.key)) {
                                    if (key != null)
                                        keyMap.delete(key);
                                    const nextMarker = start.nextM || region.start;
                                    while (start != nextMarker) {
                                        const next = start.nextSibling;
                                        parent.removeChild(start);
                                        start = next;
                                    }
                                }
                            }
                            RemoveStaleItemsHere();
                            const setIndex = initIndex(env);
                            const setPrevious = initPrevious(env);
                            const setNext = initNext(env);
                            let index = 0, prevItem = null;
                            const nextIterator = nextName ? newMap.values() : null;
                            let childRegion;
                            if (nextIterator)
                                nextIterator.next();
                            for (const [key, { item, hash }] of newMap) {
                                let rvar = (getUpdatesTo ? this.RVAR_Light(item, [getUpdatesTo(env)])
                                    : bReactive ? this.RVAR_Light(item)
                                        : item);
                                setVar(rvar);
                                setIndex(index);
                                setPrevious(prevItem);
                                if (nextIterator)
                                    setNext((_b = nextIterator.next().value) === null || _b === void 0 ? void 0 : _b.item);
                                let marker;
                                let subscriber = keyMap.get(key);
                                if (subscriber && subscriber.marker.isConnected) {
                                    marker = subscriber.marker;
                                    const nextMarker = marker.nextM;
                                    if (marker != start) {
                                        let node = marker;
                                        while (node != nextMarker) {
                                            const next = node.nextSibling;
                                            parent.insertBefore(node, start);
                                            node = next;
                                        }
                                    }
                                    marker.textContent = `${varName}(${index})`;
                                    subregion.bInit = false;
                                    subregion.start = marker;
                                    FillNextM(subregion, marker);
                                    childRegion = PrepareRegion(null, subregion, null, false);
                                    subregion.lastM = marker;
                                }
                                else {
                                    subregion.bInit = true;
                                    subregion.start = start;
                                    childRegion = PrepareRegion(null, subregion, null, true, `${varName}(${index})`);
                                    subscriber = Object.assign(Object.assign({}, childRegion), { builder: (bReactive ? bodyBuilder : undefined), env: (bReactive ? CloneEnv(env) : undefined) });
                                    if (key != null) {
                                        if (keyMap.has(key))
                                            throw `Duplicate key '${key}'`;
                                        keyMap.set(key, subscriber);
                                    }
                                    marker = childRegion.marker;
                                    marker.key = key;
                                }
                                if (hash != null
                                    && (hash == marker.hash
                                        || (marker.hash = hash, false))) {
                                }
                                else
                                    yield bodyBuilder.call(this, childRegion);
                                if (bReactive)
                                    rvar.Subscribe(subscriber);
                                prevItem = item;
                                index++;
                                start = subregion.start;
                                RemoveStaleItemsHere();
                            }
                            if (childRegion)
                                region.lastSub = childRegion;
                        }
                        finally {
                            RestoreEnv(savedEnv);
                        }
                    });
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
                return function FOREACH_Slot(region) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const subregion = PrepareRegion(srcElm, region);
                        const env = subregion.env;
                        const saved = SaveEnv();
                        const slotDef = env.constructDefs.get(slotName);
                        try {
                            const setIndex = initIndex(region.env);
                            let index = 0;
                            for (const slotBuilder of slotDef.instanceBuilders) {
                                setIndex(index++);
                                env.constructDefs.set(slotName, { instanceBuilders: [slotBuilder], constructEnv: slotDef.constructEnv });
                                yield bodyBuilder.call(this, subregion);
                            }
                        }
                        finally {
                            env.constructDefs.set(slotName, slotDef);
                            RestoreEnv(saved);
                        }
                    });
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
            this.CompConstructTemplate(signature, elmTemplate.content, elmTemplate, false, bEncapsulate, styles)
        ];
        return (function COMPONENT(region) {
            return __awaiter(this, void 0, void 0, function* () {
                for (const [bldr, srcNode] of builders)
                    yield this.CallWithErrorHandling(bldr, srcNode, region);
                const construct = { instanceBuilders, constructEnv: undefined };
                const { env } = region;
                const prevDef = env.constructDefs.get(tagName);
                env.constructDefs.set(tagName, construct);
                construct.constructEnv = CloneEnv(env);
                envActions.push(() => { env.constructDefs.set(tagName, prevDef); });
            });
        });
    }
    CompConstructTemplate(signature, contentNode, srcElm, bNewNames, bEncapsulate, styles, atts) {
        const names = [], saved = this.SaveContext();
        let bCheckAtts;
        if (bCheckAtts = !atts)
            atts = new Atts(srcElm);
        for (const param of signature.Parameters)
            names.push(atts.get(param.name, bNewNames) || param.name);
        const { tagName, RestParam } = signature;
        if (RestParam === null || RestParam === void 0 ? void 0 : RestParam.name)
            names.push(atts.get(`...${RestParam.name}`, bNewNames) || RestParam.name);
        for (const S of signature.Slots.values())
            this.AddConstruct(S);
        if (bCheckAtts)
            atts.CheckNoAttsLeft();
        try {
            const lvars = names.map(name => this.NewVar(name));
            const builder = this.CompChildNodes(contentNode);
            const customName = /^[A-Z].*-/.test(tagName) ? tagName : `RHTML-${tagName}`;
            return function TEMPLATE(region, args, mapSlotBuilders, slotEnv) {
                return __awaiter(this, void 0, void 0, function* () {
                    const saved = SaveEnv();
                    const { env, bInit } = region;
                    try {
                        for (const [slotName, instanceBuilders] of mapSlotBuilders) {
                            const savedDef = env.constructDefs.get(slotName);
                            envActions.push(() => { env.constructDefs.set(slotName, savedDef); });
                            env.constructDefs.set(slotName, { instanceBuilders, constructEnv: slotEnv });
                        }
                        let i = 0;
                        for (const lvar of lvars)
                            lvar(region.env)(args[i++]);
                        if (bEncapsulate) {
                            const elm = PrepareElement(srcElm, region, customName);
                            const shadow = bInit ? elm.attachShadow({ mode: 'open' }) : elm.shadowRoot;
                            region = { parent: shadow, start: null, bInit, env };
                            if (bInit)
                                for (const style of styles)
                                    shadow.appendChild(style.cloneNode(true));
                            else
                                region.start = shadow.children[styles.length];
                            if (args[i])
                                ApplyModifier(elm, ModifType.RestArgument, null, args[i]);
                        }
                        yield builder.call(this, region);
                    }
                    finally {
                        RestoreEnv(saved);
                    }
                });
            };
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        finally {
            this.RestoreContext(saved);
        }
    }
    CompConstructInstance(srcParent, srcElm, atts, signature) {
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
                slotBuilders.get(slotElm.tagName).push(this.CompConstructTemplate(Slot, slotElm, slotElm, true));
                srcElm.removeChild(node);
            }
        const contentSlot = signature.Slots.get('CONTENT');
        if (contentSlot)
            slotBuilders.get('CONTENT').push(this.CompConstructTemplate(contentSlot, srcElm, srcElm, true, false, null, atts));
        const preModifiers = signature.RestParam ? this.CompAttributes(atts).preModifiers : null;
        atts.CheckNoAttsLeft();
        this.bTrimLeft = false;
        return function INSTANCE(region) {
            return __awaiter(this, void 0, void 0, function* () {
                const subregion = PrepareRegion(srcElm, region);
                const localEnv = subregion.env;
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
                    subregion.env = constructEnv;
                    for (const parBuilder of instanceBuilders)
                        yield parBuilder.call(this, subregion, args, slotBuilders, slotEnv);
                }
                finally {
                    RestoreEnv(savedEnv);
                }
            });
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
        const builder = function ELEMENT(region) {
            return __awaiter(this, void 0, void 0, function* () {
                const { start, bInit, env } = region;
                let elm = PrepareElement(srcElm, region, nodeName);
                if (elm == srcElm && elm.nodeName != nodeName) {
                    (elm = document.createElement(nodeName)).append(...start.childNodes);
                    region.parent.replaceChild(elm, start);
                }
                else if (elm == start)
                    elm.removeAttribute('class');
                ApplyPreModifiers(elm, preModifiers, env);
                if (!region.bNoChildBuilding)
                    yield childnodesBuilder.call(this, { parent: elm, start: elm.firstChild, bInit, env, });
                for (const mod of postModifiers) {
                    const attName = mod.name;
                    try {
                        const val = mod.depValue(env);
                        switch (mod.modType) {
                            case ModifType.PseudoEvent:
                                if (bInit || attName == 'onupdate')
                                    val.call(elm);
                                break;
                        }
                    }
                    catch (err) {
                        throw `[${attName}]: ${err}`;
                    }
                }
            });
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
                        modType: ModifType.PseudoEvent,
                        name: m[0],
                        depValue: this.CompJavaScript(`function ${attName}(){${attValue}\n}`)
                    });
                if (m = /^on(.*)$/i.exec(attName))
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
                            postModifiers.push({ modType: ModifType.PseudoEvent, name: 'oncreate', depValue: setter });
                        preModifiers.push({ modType: ModifType.Event, name: m[2] ? 'onchange' : 'oninput', tag: propName, depValue: setter });
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
        const generators = [];
        const regIS = /(?<![\\$])\$?\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/gs;
        let isBlank = true, isTrivial = true;
        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex;
            const m = regIS.exec(data);
            const fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed)
                generators.push(fixed.replace(/\\([${}\\])/g, '$1'));
            if (m[1]) {
                generators.push(this.CompJavaScript(m[1], '{}', null, true));
                isTrivial = false;
            }
            if (m[1] || /[^ \t\r\n]/.test(fixed))
                isBlank = false;
        }
        const dep = (env) => {
            var _a;
            try {
                let result = "";
                for (const gen of generators)
                    result +=
                        (typeof gen == 'string' ? gen : (_a = gen(env)) !== null && _a !== void 0 ? _a : '');
                return result;
            }
            catch (err) {
                throw `[${name}]: ${err}`;
            }
        };
        dep.isBlank = isBlank;
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
    CompJavaScript(expr, delims = '""', bStatement = false, bReturnErrors = false, descript) {
        if (expr == null)
            return null;
        const setNames = new Set();
        let regNames = /(?<![A-Za-z0-9_$.'"`])[A-Za-z_$][A-Za-z0-9_$]*/g;
        let m, name;
        while (m = regNames.exec(expr))
            if (this.ContextMap.has(name = m[0]))
                setNames.add(name);
        let patt = '';
        for (const name of this.Context) {
            patt += `${patt ? ',' : ''}${setNames.has(name) ? '' : '_'}${name}`;
        }
        let depExpr = bStatement
            ? `'use strict';([${patt}]) => {${expr}\n}`
            : `'use strict';([${patt}]) => (${expr}\n)`;
        const errorInfo = `${descript ? `[${descript}] ` : ''}${delims[0]}${Abbreviate(expr, 60)}${delims[1]}: `;
        try {
            const routine = globalEval(depExpr);
            return (env) => {
                try {
                    return routine(env);
                }
                catch (err) {
                    const message = `${errorInfo}${err}`;
                    if (bReturnErrors && !this.Settings.bAbortOnError) {
                        console.log(message);
                        return (this.Settings.bShowErrors ? message : "");
                    }
                    else
                        throw message;
                }
            };
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
function PrepareRegion(srcElm, region, result = null, bForcedClear = false, text = '') {
    var _a, _b;
    let { parent, start, bInit } = region;
    let marker;
    if (bInit) {
        marker = parent.insertBefore(document.createComment(`${(_a = srcElm === null || srcElm === void 0 ? void 0 : srcElm.tagName) !== null && _a !== void 0 ? _a : ''} ${text}`), start);
        FillNextM(region, marker);
        region.lastM = marker;
        if (start && start == srcElm)
            region.start = start.nextSibling;
    }
    else {
        marker = start;
        region.start = marker.nextM;
        start = marker.nextSibling;
    }
    if (bForcedClear || ((_b = result != marker.rResult) !== null && _b !== void 0 ? _b : null)) {
        marker.rResult = result;
        while (start != region.start) {
            const next = start.nextSibling;
            parent.removeChild(start);
            start = next;
        }
        bInit = true;
    }
    return region.lastSub = { parent, marker, start, bInit, env: region.env };
}
function FillNextM(reg, node) {
    do {
        const { lastM } = reg;
        if (!lastM)
            break;
        lastM.nextM = node;
        reg.lastM = null;
        reg = reg.lastSub;
    } while (reg);
}
function PrepareElement(srcElm, region, nodeName = srcElm.nodeName) {
    const { start, lastM } = region;
    const elm = !region.bInit || start == srcElm
        ? (region.start = start.nextSibling, start)
        : region.parent.insertBefore(document.createElement(nodeName), start);
    if (region.bInit)
        FillNextM(region, elm);
    return elm;
}
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
class _RVAR {
    constructor(rRuntime, name, initialValue, store, storeName) {
        this.rRuntime = rRuntime;
        this.name = name;
        this.store = store;
        this.storeName = storeName;
        this.Subscribers = new Set();
        if (name)
            globalThis[name] = this;
        let s;
        if ((s = store === null || store === void 0 ? void 0 : store.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch (_a) { }
        this._Value = initialValue;
    }
    Subscribe(s) {
        this.Subscribers.add(s);
    }
    get V() { return this._Value; }
    set V(t) {
        var _a;
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
            (_a = this.store) === null || _a === void 0 ? void 0 : _a.setItem(`RVAR_${this.storeName}`, JSON.stringify(t));
        }
    }
    get U() { this.SetDirty(); return this._Value; }
    set U(t) { this.V = t; }
    SetDirty() {
        for (const sub of this.Subscribers)
            if (sub.parent.isConnected)
                this.rRuntime.AddDirty(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.RUpdate();
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
const regIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function CheckValidIdentifier(name) {
    name = name.trim();
    if (!regIdentifier.test(name))
        throw `Invalid identifier '${name}'`;
    if (/^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/.test(name))
        throw `Reserved keyword '${name}'`;
    return name;
}
const words = '(?:align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
    + '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|margin|max|min|node|offset|outer'
    + '|outline|overflow|owner|padding|parent|right|size|rule|scroll|table|tab(?=index)|text|top|value|variant)';
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
