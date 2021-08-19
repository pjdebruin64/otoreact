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
        R.ToBuild.push({ parent: elm.parentElement, start: elm, bInit: true, env: NewEnv(), });
        if (R.Settings.bBuild)
            R.DoUpdate().then(() => elm.hidden = false);
        return R;
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
    constructor(tagName) {
        this.tagName = tagName;
        this.Parameters = [];
        this.RestParam = null;
        this.Slots = new Map();
    }
    Equals(sig) {
        let result = sig
            && this.tagName == sig.tagName
            && this.Parameters.length == sig.Parameters.length
            && this.Slots.size == sig.Slots.size;
        for (let i = 0; i < this.Parameters.length; i++)
            result && (result = this.Parameters[i].name == sig.Parameters[i].name);
        result && (result = this.RestParam?.name == sig.RestParam?.name);
        for (let [slotname, slotSig] of this.Slots)
            result && (result = slotSig.Equals(sig.Slots.get(slotname)));
        return result;
    }
}
const globalEval = eval, globalFetch = fetch;
var ModifierType;
(function (ModifierType) {
    ModifierType[ModifierType["Attr"] = 0] = "Attr";
    ModifierType[ModifierType["Prop"] = 1] = "Prop";
    ModifierType[ModifierType["Class"] = 2] = "Class";
    ModifierType[ModifierType["Style"] = 3] = "Style";
    ModifierType[ModifierType["Event"] = 4] = "Event";
    ModifierType[ModifierType["AddToStyle"] = 5] = "AddToStyle";
    ModifierType[ModifierType["AddToClassList"] = 6] = "AddToClassList";
    ModifierType[ModifierType["RestArgument"] = 7] = "RestArgument";
    ModifierType[ModifierType["PseudoEvent"] = 8] = "PseudoEvent";
})(ModifierType || (ModifierType = {}));
;
function ApplyModifier(elm, modType, name, val) {
    switch (modType) {
        case ModifierType.Attr:
            elm.setAttribute(name, val ?? '');
            break;
        case ModifierType.Prop:
            if (val != null)
                elm[name] = val;
            else
                delete elm[name];
            break;
        case ModifierType.Event:
            elm[name] = val;
            break;
        case ModifierType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModifierType.Style:
            if (val !== undefined)
                elm.style[name] = val ?? '';
            break;
        case ModifierType.AddToStyle:
            Object.assign(elm.style, val);
            break;
        case ModifierType.AddToClassList:
            if (Array.isArray(val))
                for (const className of val)
                    elm.classList.add(className);
            else
                for (const [className, bln] of Object.entries(val))
                    if (bln)
                        elm.classList.add(className);
            break;
        case ModifierType.RestArgument:
            for (const { modType, name, value } of val)
                ApplyModifier(elm, modType, name, value);
            break;
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
let num = 0;
class RCompiler {
    constructor(clone) {
        this.instanceNum = num++;
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
        this.Settings = clone ? { ...clone.Settings } : { ...defaultSettings };
        this.AddedHeaderElements = clone ? clone.AddedHeaderElements : [];
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
        this.Settings = { ...defaultSettings, ...settings, };
        const t0 = Date.now();
        const savedR = RHTML;
        RHTML = this;
        if (bIncludeSelf)
            this.Builder = this.CompileElement(elm.parentElement, elm)[0];
        else
            this.Builder = this.CompileChildNodes(elm);
        this.bCompiled = true;
        RHTML = savedR;
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
    }
    async Build(reg) {
        const savedRCompiler = RHTML, start = reg.start;
        RHTML = this;
        await this.Builder(reg);
        if (reg.marker)
            this.AllRegions.push({
                parent: reg.parent, marker: reg.marker, builder: this.Builder, env: NewEnv()
            });
        else
            this.AllRegions.push({
                parent: reg.parent, start, builder: this.Builder, env: NewEnv()
            });
        RHTML = savedRCompiler;
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
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        this.bUpdating = true;
        let savedRCompiler = RHTML;
        try {
            if (this.ToBuild.length) {
                const t0 = Date.now();
                this.builtNodeCount = 0;
                for (const reg of this.ToBuild)
                    await this.Build(reg);
                console.log(`Built ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
                this.ToBuild = [];
            }
            if (!this.bHasReacts)
                for (const s of this.AllRegions)
                    this.AddDirty(s);
            if (this.DirtySubs.size) {
                RHTML = this;
                const t0 = Date.now();
                this.builtNodeCount = 0;
                for (const { parent, marker, start, builder, env } of this.DirtySubs.values()) {
                    try {
                        await builder.call(this, { parent,
                            start: start || marker?.nextSibling || parent.firstChild,
                            env, });
                    }
                    catch (err) {
                        const msg = `ERROR: ${err}`;
                        console.log(msg);
                    }
                }
                console.log(`Updated ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
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
    CompileChildNodes(srcParent, bBlockLevel, childNodes = Array.from(srcParent.childNodes), bNorestore) {
        const builders = [];
        const saved = this.SaveContext();
        this.sourceNodeCount += childNodes.length;
        try {
            for (const srcNode of childNodes) {
                switch (srcNode.nodeType) {
                    case Node.ELEMENT_NODE:
                        const builderElm = this.CompileElement(srcParent, srcNode, bBlockLevel);
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
                            const getText = this.CompileInterpolatedString(str);
                            async function Text(region) {
                                const { start, lastM, bInit } = region, content = getText(region.env);
                                let text;
                                if (bInit && start != srcNode)
                                    text = region.parent.insertBefore(document.createTextNode(content), start);
                                else {
                                    (text = start).data = content;
                                    region.start = start.nextSibling;
                                }
                                if (lastM) {
                                    lastM.nextM = text;
                                    region.lastM = null;
                                }
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
        return async function ChildNodes(region) {
            const savedEnv = SaveEnv();
            try {
                for (const [builder, node] of builders)
                    await this.CallWithErrorHandling(builder, node, region);
                this.builtNodeCount += builders.length;
            }
            finally {
                if (!bNorestore)
                    RestoreEnv(savedEnv);
            }
        };
    }
    CompileElement(srcParent, srcElm, bBlockLevel) {
        let builder = null;
        let reactingRvars, bNoChildUpdates;
        for (const reactonAtt of this.preMods) {
            const val = GetAttribute(srcElm, reactonAtt);
            if (val) {
                this.bHasReacts = true;
                bNoChildUpdates = (reactonAtt == 'thisreactson');
                reactingRvars = val.split(',').map(expr => this.CompileExpression(expr));
                break;
            }
        }
        labelNoCheck: try {
            const construct = this.Constructs.get(srcElm.tagName);
            if (construct)
                builder = this.CompileConstructInstance(srcParent, srcElm, construct);
            else {
                switch (srcElm.nodeName) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            srcParent.removeChild(srcElm);
                            const rvarName = GetAttribute(srcElm, 'rvar');
                            const varName = rvarName || GetAttribute(srcElm, 'name') || GetAttribute(srcElm, 'var', true);
                            const getValue = this.CompileAttribute(srcElm, 'value');
                            const getStore = rvarName && this.CompileAttrExpression(srcElm, 'store');
                            const newVar = this.NewVar(varName);
                            const bReact = GetAttribute(srcElm, 'react') != null;
                            const subBuilder = this.CompileChildNodes(srcElm);
                            builder = async function DEFINE(region) {
                                const subRegion = PrepareRegion(srcElm, region, undefined, undefined, varName);
                                const { marker } = subRegion;
                                if (region.bInit || bReact) {
                                    const value = getValue && getValue(region.env);
                                    marker.rValue = rvarName
                                        ? new _RVAR(this, null, value, getStore && getStore(region.env), rvarName)
                                        : value;
                                }
                                newVar(region.env)(marker.rValue);
                                await subBuilder.call(this, subRegion);
                            };
                        }
                        break;
                    case 'IF':
                    case 'CASE':
                        {
                            const bHiding = CBool(GetAttribute(srcElm, 'hiding'));
                            const caseList = [];
                            const getCondition = (srcElm.nodeName == 'IF') && this.CompileAttrExpression(srcElm, 'cond', true);
                            const getValue = this.CompileAttrExpression(srcElm, 'value');
                            CheckNoAttributesLeft(srcElm);
                            const bodyNodes = [];
                            const bTrimLeft = this.bTrimLeft;
                            for (const child of srcElm.childNodes) {
                                if (child.nodeType == Node.ELEMENT_NODE) {
                                    const childElm = child;
                                    this.bTrimLeft = bTrimLeft;
                                    const saved = this.SaveContext();
                                    try {
                                        let condition;
                                        let patt;
                                        switch (child.nodeName) {
                                            case 'WHEN':
                                                condition = this.CompileAttrExpression(childElm, 'cond');
                                                let pattern;
                                                if ((pattern = GetAttribute(childElm, 'match')) != null)
                                                    patt = this.CompilePattern(pattern);
                                                else if ((pattern = GetAttribute(childElm, 'urlmatch')) != null)
                                                    (patt = this.CompilePattern(pattern)).url = true;
                                                else if ((pattern = GetAttribute(childElm, 'regmatch')) != null) {
                                                    const lvars = GetAttribute(childElm, 'captures')?.split(',') || [];
                                                    patt = { regex: new RegExp(pattern, 'i'), lvars: lvars.map(this.NewVar.bind(this)) };
                                                }
                                                else
                                                    patt = null;
                                                if (bHiding && patt?.lvars?.length)
                                                    throw `Pattern capturing cannot be combined with hiding`;
                                                if (patt && !getValue)
                                                    throw `A match is requested but no 'value' is specified.`;
                                            case 'ELSE':
                                                const builder = this.CompileChildNodes(childElm, bBlockLevel);
                                                caseList.push({ condition, patt, builder, childElm });
                                                CheckNoAttributesLeft(childElm);
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
                                    builder: this.CompileChildNodes(srcElm, bBlockLevel, bodyNodes),
                                    childElm: srcElm
                                });
                            builder =
                                async function CASE(region) {
                                    const value = getValue && getValue(region.env);
                                    let choosenAlt = null;
                                    let matchResult;
                                    for (const alt of caseList)
                                        try {
                                            if ((!alt.condition || alt.condition(region.env))
                                                && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))) {
                                                choosenAlt = alt;
                                                break;
                                            }
                                        }
                                        catch (err) {
                                            throw `${OuterOpenTag(alt.childElm)}${err}`;
                                        }
                                    if (bHiding) {
                                        let { start, bInit, env } = PrepareRegion(srcElm, region, null, region.bInit);
                                        for (const alt of caseList) {
                                            const bHidden = alt != choosenAlt;
                                            let elm;
                                            if (!bInit || start == srcElm) {
                                                elm = start;
                                                start = start.nextSibling;
                                            }
                                            else
                                                region.parent.insertBefore(elm = document.createElement(alt.childElm.nodeName), start);
                                            elm.hidden = bHidden;
                                            if ((!bHidden || bInit) && !region.bNoChildBuilding)
                                                await this.CallWithErrorHandling(alt.builder, alt.childElm, { parent: elm, start: elm.firstChild, bInit, env });
                                        }
                                    }
                                    else {
                                        const subregion = PrepareRegion(srcElm, region, choosenAlt);
                                        if (choosenAlt) {
                                            const saved = SaveEnv();
                                            try {
                                                if (choosenAlt.patt) {
                                                    let i = 1;
                                                    for (const lvar of choosenAlt.patt.lvars)
                                                        lvar(region.env)((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[i++]));
                                                }
                                                await this.CallWithErrorHandling(choosenAlt.builder, choosenAlt.childElm, subregion);
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
                        builder = this.CompileForeach(srcParent, srcElm, bBlockLevel);
                        break;
                    case 'INCLUDE':
                        {
                            const src = GetAttribute(srcElm, 'src', true);
                            let C = new RCompiler(this);
                            const task = (async () => {
                                const response = await globalFetch(src);
                                const textContent = await response.text();
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html');
                                C.Compile(parsedContent.body, this.Settings, false);
                                this.bHasReacts || (this.bHasReacts = C.bHasReacts);
                            })();
                            builder =
                                async function INCLUDE(region) {
                                    const subregion = PrepareRegion(srcElm, region);
                                    await task;
                                    await C.Builder(subregion);
                                };
                        }
                        break;
                    case 'IMPORT':
                        {
                            const src = GetAttribute(srcElm, 'src', true);
                            const listImports = new Array();
                            const dummyEnv = NewEnv();
                            for (const child of srcElm.children) {
                                const signature = this.ParseSignature(child);
                                const holdOn = async function holdOn(region, args, mapSlotBuilders, slotEnv) {
                                    await task;
                                    region.env = placeholder.constructEnv;
                                    for (const builder of placeholder.instanceBuilders)
                                        await builder.call(this, region, args, mapSlotBuilders, slotEnv);
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
                                    promiseModule = globalFetch(src)
                                        .then(async (response) => {
                                        const textContent = await response.text();
                                        const parser = new DOMParser();
                                        const parsedContent = parser.parseFromString(textContent, 'text/html');
                                        const builder = compiler.CompileChildNodes(parsedContent.body, true, undefined, true);
                                        this.bHasReacts || (this.bHasReacts = compiler.bHasReacts);
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
                                    if (!clientSig.Equals(signature))
                                        throw `Imported signature <${tagName}> is unequal to module signature <${tagName}>`;
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
                            const expList = GetAttribute(srcElm, 'on', true, true).split(',');
                            const getDependencies = expList.map(expr => this.CompileExpression(expr));
                            const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                            builder = async function REACT(region) {
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
                                await bodyBuilder.call(this, subregion);
                            };
                        }
                        break;
                    case 'RHTML':
                        {
                            const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                            srcParent.removeChild(srcElm);
                            builder = async function RHTML(region) {
                                const tempElm = document.createElement('RHTML');
                                await bodyBuilder.call(this, { parent: tempElm, start: null, env: region.env, bInit: true });
                                const result = tempElm.innerText;
                                const subregion = PrepareRegion(srcElm, region, result);
                                if (subregion.bInit) {
                                    tempElm.innerHTML = result;
                                    const R = new RCompiler();
                                    subregion.env = NewEnv();
                                    const hdrElements = subregion.marker['AddedHeaderElements'];
                                    if (hdrElements)
                                        for (const elm of hdrElements)
                                            document.head.removeChild(elm);
                                    R.Compile(tempElm, { bRunScripts: true }, false);
                                    subregion.marker['AddedHeaderElements'] = R.AddedHeaderElements;
                                    await R.Build(subregion);
                                }
                            };
                        }
                        break;
                    case 'SCRIPT':
                        builder = this.CompileScript(srcParent, srcElm);
                        break;
                    case 'STYLE':
                        builder = this.CompileStyle(srcParent, srcElm);
                        break;
                    case 'COMPONENT':
                        builder = this.CompileComponent(srcParent, srcElm);
                        break;
                    default:
                        builder = this.CompileHTMLElement(srcElm);
                        break labelNoCheck;
                }
                CheckNoAttributesLeft(srcElm);
            }
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        if (reactingRvars) {
            const bodyBuilder = builder;
            builder = async function REACT(region) {
                let { parent, marker } = PrepareRegion(srcElm, region, null, null, 'reacton');
                await bodyBuilder.call(this, region);
                if (region.bInit) {
                    const subscriber = {
                        parent, marker,
                        builder: async function reacton(reg) {
                            if (bNoChildUpdates && !reg.bInit)
                                reg.bNoChildBuilding = true;
                            await this.CallWithErrorHandling(bodyBuilder, srcElm, reg);
                            this.builtNodeCount++;
                        },
                        env: CloneEnv(region.env),
                    };
                    for (const getRvar of reactingRvars) {
                        const rvar = getRvar(region.env);
                        rvar.Subscribe(subscriber);
                    }
                }
            };
        }
        if (builder)
            return [builder, srcElm];
        return null;
    }
    async CallWithErrorHandling(builder, srcNode, region) {
        let start = region.start;
        if (start?.errorNode) {
            region.parent.removeChild(start.errorNode);
            start.errorNode = undefined;
        }
        try {
            await builder.call(this, region);
        }
        catch (err) {
            const message = srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode = region.parent.insertBefore(document.createTextNode(message), region.start);
                if (start || (start = region.marker))
                    start.errorNode = errorNode;
            }
        }
    }
    CompileScript(srcParent, srcElm) {
        srcParent.removeChild(srcElm);
        const type = GetAttribute(srcElm, 'type');
        const src = GetAttribute(srcElm, 'src');
        if (GetAttribute(srcElm, 'nomodule') != null || this.Settings.bRunScripts) {
            let script = srcElm.text;
            const defines = GetAttribute(srcElm, 'defines');
            if (defines)
                for (let name of defines.split(',')) {
                    name = CheckValidIdentifier(name);
                    script += `;globalThis.${name} = ${name}\n`;
                }
            const elm = document.createElement('script');
            if (src)
                elm.src = src;
            else
                elm.text = `'use strict';{${script}\n}`;
            document.head.appendChild(elm);
            this.AddedHeaderElements.push(elm);
        }
        return null;
    }
    CompileStyle(srcParent, srcElm) {
        srcParent.removeChild(srcElm);
        document.head.appendChild(srcElm);
        this.AddedHeaderElements.push(srcElm);
        return null;
    }
    CompileForeach(srcParent, srcElm, bBlockLevel) {
        const varName = GetAttribute(srcElm, 'let');
        let indexName = GetAttribute(srcElm, 'index');
        if (indexName == '')
            indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) {
                const getRange = this.CompileAttrExpression(srcElm, 'of', true);
                let prevName = GetAttribute(srcElm, 'previous');
                if (prevName == '')
                    prevName = 'previous';
                let nextName = GetAttribute(srcElm, 'next');
                if (nextName == '')
                    nextName = 'next';
                const bReactive = CBool(GetAttribute(srcElm, 'updateable') ?? GetAttribute(srcElm, 'reactive'));
                const getUpdatesTo = this.CompileAttrExpression(srcElm, 'updates');
                const initVar = this.NewVar(varName);
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);
                const initNext = this.NewVar(nextName);
                const getKey = this.CompileAttrExpression(srcElm, 'key');
                const getHash = this.CompileAttrExpression(srcElm, 'hash');
                const bodyBuilder = this.CompileChildNodes(srcElm);
                srcParent.removeChild(srcElm);
                return async function FOREACH(region) {
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
                        for (const item of iterator) {
                            setVar(item);
                            const hash = getHash && getHash(env);
                            const key = getKey ? getKey(env) : hash;
                            if (key != null && newMap.has(key))
                                throw `Key '${key}' is not unique`;
                            newMap.set(key ?? {}, { item, hash });
                        }
                        function RemoveStaleItemsHere() {
                            let key;
                            while (start && start != region.start && !newMap.has(key = start.key)) {
                                if (key != null)
                                    keyMap.delete(key);
                                const nextMarker = start.nextM;
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
                                setNext(nextIterator.next().value?.item);
                            let marker;
                            let subscriber = keyMap.get(key);
                            let childRegion;
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
                                const lastM = subregion.lastM;
                                childRegion = PrepareRegion(null, subregion, null, false);
                                if (lastM)
                                    lastM.nextM = marker;
                                subregion.lastM = marker;
                            }
                            else {
                                subregion.bInit = true;
                                subregion.start = start;
                                childRegion = PrepareRegion(null, subregion, null, true, `${varName}(${index})`);
                                subscriber = {
                                    ...childRegion,
                                    builder: (bReactive ? bodyBuilder : undefined),
                                    env: (bReactive ? CloneEnv(env) : undefined),
                                };
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
                                await bodyBuilder.call(this, childRegion);
                            if (bReactive)
                                rvar.Subscribe(subscriber);
                            prevItem = item;
                            index++;
                            start = subregion.start;
                            RemoveStaleItemsHere();
                        }
                    }
                    finally {
                        RestoreEnv(savedEnv);
                    }
                };
            }
            else {
                const slotName = GetAttribute(srcElm, 'of', true, true);
                const slot = this.Constructs.get(slotName);
                if (!slot)
                    throw `Missing attribute [let]`;
                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompileChildNodes(srcElm, bBlockLevel);
                srcParent.removeChild(srcElm);
                return async function FOREACH_Slot(region) {
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
                            await bodyBuilder.call(this, subregion);
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
        const signature = new Signature(elmSignature.tagName);
        for (const attr of elmSignature.attributes) {
            if (signature.RestParam)
                throw `Rest parameter must be the last`;
            const m = /^(#|\.\.\.)?(.*?)(\?)?$/.exec(attr.name);
            if (m[1] == '...')
                signature.RestParam = { name: m[2], pDefault: undefined };
            else
                signature.Parameters.push({ name: m[2],
                    pDefault: attr.value != ''
                        ? (m[1] == '#' ? this.CompileExpression(attr.value) : this.CompileInterpolatedString(attr.value))
                        : m[3] ? (_) => undefined
                            : null
                });
        }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.tagName, this.ParseSignature(elmSlot));
        return signature;
    }
    CompileComponent(srcParent, srcElm) {
        srcParent.removeChild(srcElm);
        const { signature, elmTemplate, builders } = this.AnalyseComponent(srcElm);
        const tagName = signature.tagName;
        this.AddConstruct(signature);
        const instanceBuilders = [
            this.CompileConstructTemplate(signature, elmTemplate.content, elmTemplate, false)
        ];
        return (async function COMPONENT(region) {
            for (const [bldr, srcNode] of builders)
                await this.CallWithErrorHandling(bldr, srcNode, region);
            const construct = { instanceBuilders, constructEnv: undefined };
            const { env } = region;
            const prevDef = env.constructDefs.get(tagName);
            env.constructDefs.set(tagName, construct);
            construct.constructEnv = CloneEnv(env);
            envActions.push(() => { env.constructDefs.set(tagName, prevDef); });
        });
    }
    AnalyseComponent(srcElm) {
        const builders = [];
        let signature, elmTemplate;
        for (const srcChild of Array.from(srcElm.children))
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    const builder = this.CompileScript(srcElm, srcChild);
                    if (builder)
                        builders.push([builder, srcChild]);
                    break;
                case 'STYLE':
                    this.CompileStyle(srcElm, srcChild);
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
        if (!signature)
            throw `Missing signature`;
        if (!elmTemplate)
            throw 'Missing <TEMPLATE>';
        return { signature, elmTemplate, builders };
    }
    CompileConstructTemplate(construct, contentNode, srcElm, bNewNames) {
        const saved = this.SaveContext();
        const names = [];
        for (const param of construct.Parameters)
            names.push(bNewNames && GetAttribute(srcElm, param.name, true) || param.name);
        const restParam = construct.RestParam;
        if (restParam)
            names.push(bNewNames && GetAttribute(srcElm, `...${restParam.name}`, true) || restParam.name);
        for (const S of construct.Slots.values())
            this.AddConstruct(S);
        try {
            const lvars = names.map(name => this.NewVar(name));
            const builder = this.CompileChildNodes(contentNode);
            return async function (region, args, mapSlotBuilders, slotEnv) {
                const saved = SaveEnv();
                const env = region.env;
                try {
                    for (const [slotName, instanceBuilders] of mapSlotBuilders) {
                        const savedDef = env.constructDefs.get(slotName);
                        envActions.push(() => { env.constructDefs.set(slotName, savedDef); });
                        env.constructDefs.set(slotName, { instanceBuilders, constructEnv: slotEnv });
                    }
                    let i = 0;
                    for (const lvar of lvars)
                        lvar(region.env)(args[i++]);
                    await builder.call(this, region);
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
    CompileConstructInstance(srcParent, srcElm, signature) {
        srcParent.removeChild(srcElm);
        const tagName = signature.tagName;
        const { preModifiers } = this.CompileAttributes(srcElm);
        const getArgs = [];
        for (const { name, pDefault } of signature.Parameters) {
            let pValue = null;
            getP: {
                let i = 0;
                for (const P of preModifiers) {
                    if (P.name == name) {
                        preModifiers.splice(i, 1);
                        switch (P.modType) {
                            case ModifierType.Attr:
                            case ModifierType.Prop:
                            case ModifierType.Event:
                                pValue = P.depValue;
                                break getP;
                            default:
                                throw `Invalid argument ${srcElm.attributes.item(i).name}`;
                        }
                    }
                    i++;
                }
                if (!pDefault)
                    throw `Missing argument [${name}]`;
                pValue = pDefault;
            }
            getArgs.push(pValue);
        }
        if (!signature.RestParam && preModifiers.length)
            throw `Unknown parameter${preModifiers.length > 1 ? 's' : ''}: ${preModifiers.map(m => m.name).join(',')}`;
        const slotBuilders = new Map();
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);
        let slotElm, Slot;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE
                && (Slot = signature.Slots.get((slotElm = node).tagName))) {
                slotBuilders.get(slotElm.tagName).push(this.CompileConstructTemplate(Slot, slotElm, slotElm, true));
                srcElm.removeChild(node);
            }
        const contentSlot = signature.Slots.get('CONTENT');
        if (contentSlot)
            slotBuilders.get('CONTENT').push(this.CompileConstructTemplate(contentSlot, srcElm, srcElm, true));
        this.bTrimLeft = false;
        return async function INSTANCE(region) {
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
                    await parBuilder.call(this, subregion, args, slotBuilders, slotEnv);
            }
            finally {
                RestoreEnv(savedEnv);
            }
        };
    }
    CompileHTMLElement(srcElm) {
        const nodeName = srcElm.nodeName.replace(/\.+$/, '');
        const bTrim = /^(BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL)$/.test(nodeName);
        const { preModifiers, postModifiers } = this.CompileAttributes(srcElm);
        if (bTrim)
            this.bTrimLeft = true;
        const childnodesBuilder = this.CompileChildNodes(srcElm, bTrim);
        if (bTrim)
            this.bTrimLeft = true;
        const builder = async function ELEMENT(region) {
            const { parent, start, bInit, env, lastM } = region;
            let elm;
            if (!bInit || start == srcElm) {
                region.start = start.nextSibling;
                elm = start;
                if (elm.tagName != nodeName) {
                    (elm = document.createElement(nodeName)).append(...start.childNodes);
                    parent.replaceChild(elm, start);
                }
                else
                    elm.removeAttribute('class');
            }
            else
                parent.insertBefore(elm = document.createElement(nodeName), start);
            if (lastM) {
                lastM.nextM = elm;
                region.lastM = null;
            }
            for (const { modType, name, depValue } of preModifiers) {
                try {
                    const value = depValue(env);
                    ApplyModifier(elm, modType, name, value);
                }
                catch (err) {
                    throw `[${name}]: ${err}`;
                }
            }
            if (!region.bNoChildBuilding)
                await childnodesBuilder.call(this, { parent: elm, start: elm.firstChild, bInit, env, });
            for (const mod of postModifiers) {
                const attName = mod.name;
                try {
                    const val = mod.depValue(env);
                    switch (mod.modType) {
                        case ModifierType.PseudoEvent:
                            if (bInit || attName == 'onupdate')
                                val.call(elm);
                            break;
                    }
                }
                catch (err) {
                    throw `[${attName}]: ${err}`;
                }
            }
            if (nodeName == 'SCRIPT')
                elm.text = elm.textContent;
        };
        builder.bTrim = bTrim;
        return builder;
    }
    CompileAttributes(srcElm) {
        const preModifiers = [], postModifiers = [];
        for (const attr of srcElm.attributes) {
            const attrName = attr.name;
            let m;
            try {
                if (m = /^on(create|update)$/i.exec(attrName))
                    postModifiers.push({
                        modType: ModifierType.PseudoEvent,
                        name: m[0],
                        depValue: this.CompileExpression(`function ${attrName}(){${attr.value}\n}`)
                    });
                if (m = /^on(.*)$/i.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Event,
                        name: CapitalizeProp(m[0]),
                        depValue: this.CompileExpression(`function ${attrName}(event){${attr.value}\n}`)
                    });
                else if (m = /^#class:(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Class, name: m[1],
                        depValue: this.CompileExpression(attr.value)
                    });
                else if (m = /^#style\.(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression(attr.value)
                    });
                else if (m = /^style\.(.*)$/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompileInterpolatedString(attr.value)
                    });
                else if (attrName == '+style')
                    preModifiers.push({
                        modType: ModifierType.AddToStyle, name: null,
                        depValue: this.CompileExpression(attr.value)
                    });
                else if (m = /^#(.*)/.exec(attrName))
                    preModifiers.push({
                        modType: ModifierType.Prop, name: CapitalizeProp(m[1]),
                        depValue: this.CompileExpression(attr.value)
                    });
                else if (attrName == "+class")
                    preModifiers.push({
                        modType: ModifierType.AddToClassList, name: null,
                        depValue: this.CompileExpression(attr.value)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attrName)) {
                    const propName = CapitalizeProp(m[3]);
                    CheckAssignmentTarget(attr.value);
                    const setter = this.CompileExpression(`function(){const ORx=this.${propName};if(${attr.value}!==ORx)${attr.value}=ORx}`);
                    if (m[1] == '@')
                        preModifiers.push({ modType: ModifierType.Prop, name: propName, depValue: this.CompileExpression(attr.value) });
                    else
                        postModifiers.push({ modType: ModifierType.PseudoEvent, name: 'oncreate', depValue: setter });
                    preModifiers.push({ modType: ModifierType.Event, name: m[2] ? 'onchange' : 'oninput', tag: propName, depValue: setter });
                }
                else if (m = /^\.\.\.(.*)/.exec(attrName)) {
                    if (attr.value)
                        throw `Rest parameter cannot have a value`;
                    preModifiers.push({
                        modType: ModifierType.RestArgument, name: null,
                        depValue: this.CompileName(m[1])
                    });
                }
                else
                    preModifiers.push({
                        modType: ModifierType.Attr, name: attrName,
                        depValue: this.CompileInterpolatedString(attr.value)
                    });
            }
            catch (err) {
                throw (`[${attrName}]: ${err}`);
            }
        }
        return { preModifiers, postModifiers };
    }
    CompileInterpolatedString(data, name) {
        const generators = [];
        const regIS = /(?<![\\$])\$?\{(.*?)(?<!\\)\}|$/gs;
        let isBlank = true;
        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex;
            const m = regIS.exec(data);
            const fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed)
                generators.push(fixed.replace(/\\([${}\\])/g, '$1'));
            if (m[1])
                generators.push(this.CompileExpression(m[1], '{}', null, true));
            if (m[1] || /[^ \t\r\n]/.test(fixed))
                isBlank = false;
        }
        const dep = (env) => {
            try {
                let result = "";
                for (const gen of generators)
                    result +=
                        (typeof gen == 'string' ? gen : gen(env) ?? '');
                return result;
            }
            catch (err) {
                throw `[${name}]: ${err}`;
            }
        };
        dep.isBlank = isBlank;
        return dep;
    }
    CompilePattern(patt) {
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
    CompileAttrExpression(elm, attName, bRequired) {
        return this.CompileExpression(GetAttribute(elm, attName, bRequired, true));
    }
    CompileAttribute(elm, attName, bRequired) {
        const value = GetAttribute(elm, attName);
        if (value != null)
            return this.CompileInterpolatedString(value);
        return this.CompileAttrExpression(elm, `#${attName}`, bRequired);
    }
    CompileExpression(expr, delims = '""', bScript = false, bReturnErrors = false, name) {
        if (expr == null)
            return null;
        const mapNames = new Map();
        let regNames = /(?<![A-Za-z0-9_$.'"`])[A-Za-z_$][A-Za-z0-9_$]*/g;
        let m;
        while (m = regNames.exec(expr)) {
            const name = m[0];
            if (this.ContextMap.has(name))
                mapNames.set(name, undefined);
        }
        let patt = '';
        for (const name of this.Context) {
            patt += `${patt ? ',' : ''}${mapNames.has(name) ? '' : '_'}${name}`;
        }
        let depExpr = bScript
            ? `([${patt}]) => {'use strict';${expr}\n}`
            : `([${patt}]) => (${expr}\n)`;
        const errorInfo = `${name ? `[${name}] ` : ''}${delims[0]}${Abbreviate(expr, 60)}${delims[1]}: `;
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
    CompileName(name) {
        const i = this.ContextMap.get(name);
        if (i === undefined)
            throw `Unknown name '${name}'`;
        return env => env[i];
    }
}
function PrepareRegion(srcElm, region, result = null, bForcedClear = false, text = '') {
    let { parent, start, bInit, lastM } = region;
    let marker;
    if (bInit) {
        marker = region.lastM = parent.insertBefore(document.createComment(`${srcElm?.tagName ?? ''} ${text}`), start);
        if (lastM)
            lastM.nextM = marker;
        if (start && start == srcElm)
            region.start = start.nextSibling;
    }
    else {
        marker = start;
        region.start = marker.nextM;
        start = marker.nextSibling;
    }
    if (bInit || (bInit = bForcedClear || (result != marker.rResult ?? null))) {
        marker.rResult = result;
        while (start != region.start) {
            const next = start.nextSibling;
            parent.removeChild(start);
            start = next;
        }
    }
    return { parent, marker, start, bInit, env: region.env };
}
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
function CheckAssignmentTarget(target) {
    try {
        globalEval(`()=>{${target}=null}`);
    }
    catch (err) {
        throw `Invalid left-hand side '${target}'`;
    }
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
        if ((s = store?.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch { }
        this._Value = initialValue;
    }
    Subscribe(s) {
        this.Subscribers.add(s);
    }
    get V() { return this._Value; }
    set V(t) {
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
            this.store?.setItem(`RVAR_${this.storeName}`, JSON.stringify(t));
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
function CheckNoAttributesLeft(elm) {
    let atts = [];
    for (const { nodeName } of elm.attributes)
        if (!/^_/.test(nodeName))
            atts.push(nodeName);
    if (atts.length)
        throw `Unknown attribute${atts.length > 1 ? 's' : ''}: ${atts.join(',')}`;
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
function GetAttribute(elm, name, bRequired, bHashAllowed) {
    let value = elm.getAttribute(name);
    if (value == null && bHashAllowed) {
        name = `#${name}`;
        value = elm.getAttribute(name);
    }
    if (value != null)
        elm.attributes.removeNamedItem(name);
    else if (bRequired)
        throw `Missing attribute [${name}]`;
    return value;
}
function OuterOpenTag(elm, maxLength) {
    return Abbreviate(/<.*?(?=>)/.exec(elm.outerHTML)[0], maxLength - 1) + '>';
}
function Abbreviate(s, maxLength) {
    if (maxLength && s.length > maxLength)
        return s.substr(0, maxLength - 3) + "...";
    return s;
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
