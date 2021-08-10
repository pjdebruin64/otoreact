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
        let { rootPattern } = settings;
        if (rootPattern) {
            const url = document.location.href;
            const m = url.match(`^.*(${rootPattern})`);
            if (!m)
                throw `Root pattern '${rootPattern}' does not match URL '${url}'`;
            globalThis.RootPath = RootPath = (new URL(m[0])).pathname;
        }
        SetDocLocation();
        const R = RHTML;
        R.Compile(elm, { ...defaultSettings, ...settings });
        R.ToBuild.push({ parent: elm, start: elm.firstChild, bInit: true, env: NewEnv(), });
        if (R.Settings.bBuild)
            R.DoUpdate()
                .then(() => elm.hidden = false);
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
    constructor(TagName) {
        this.TagName = TagName;
        this.Parameters = [];
        this.RestParam = null;
        this.Slots = new Map();
    }
    Equals(sig) {
        let result = sig
            && this.TagName == sig.TagName
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
    ModifierType[ModifierType["PseudoEvent"] = 5] = "PseudoEvent";
    ModifierType[ModifierType["AddToStyle"] = 6] = "AddToStyle";
    ModifierType[ModifierType["AddToClassList"] = 7] = "AddToClassList";
    ModifierType[ModifierType["RestArgument"] = 8] = "RestArgument";
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
        this.DirtyRegions = new Set();
        this.bUpdating = false;
        this.handleUpdate = null;
        this.sourceNodeCount = 0;
        this.builtNodeCount = 0;
        this.Context = clone ? clone.Context.slice() : [];
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.Constructs = clone ? new Map(clone.Constructs) : new Map();
        this.Settings = clone ? { ...clone.Settings } : undefined;
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
        CheckValidIdentifier(name);
        let i = this.ContextMap.get(name);
        const bNewName = i == null;
        if (bNewName) {
            i = this.Context.push(name) - 1;
            this.ContextMap.set(name, i);
            this.restoreActions.push(() => this.ContextMap.delete(this.Context.pop()));
        }
        return function InitVar(env) {
            const prev = env[i];
            envActions.push(() => { env[i] = prev; });
            return function SetVar(value) {
                env[i] = value;
            };
        }.bind(this);
    }
    AddConstruct(C) {
        const CName = C.TagName, savedConstr = this.Constructs.get(C.TagName);
        this.Constructs.set(CName, C);
        this.restoreActions.push(() => this.Constructs.set(CName, savedConstr));
    }
    Compile(elm, settings) {
        this.Settings = { ...defaultSettings, ...settings, };
        const t0 = Date.now();
        this.Builder = this.CompileChildNodes(elm);
        this.bCompiled = true;
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
    }
    async Build(reg) {
        const savedRCompiler = RHTML;
        RHTML = this;
        await this.Builder(reg);
        this.AllRegions.push({
            parent: reg.parent, marker: reg.marker, builder: this.Builder, env: NewEnv()
        });
        RHTML = savedRCompiler;
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
            if (!this.bHasReacts && this.bSomethingDirty)
                for (const s of this.AllRegions)
                    this.DirtyRegions.add(s);
            if (this.DirtyRegions.size) {
                RHTML = this;
                const t0 = Date.now();
                this.builtNodeCount = 0;
                this.bSomethingDirty = false;
                for (const { parent, marker, builder, env } of this.DirtyRegions) {
                    try {
                        await builder.call(this, { parent, start: marker ? marker.nextSibling : parent.firstChild, env, });
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
            this.DirtyRegions.clear();
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
                        R.DirtyRegions.add(sub);
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
    CompileChildNodes(srcParent, bBlockLevel, childNodes = Array.from(srcParent.childNodes)) {
        const builders = [];
        const saved = this.SaveContext();
        this.sourceNodeCount += childNodes.length;
        for (const srcNode of childNodes) {
            switch (srcNode.nodeType) {
                case Node.ELEMENT_NODE:
                    builders.push(...this.CompileElement(srcParent, srcNode, bBlockLevel));
                    if (builders.length && builders[builders.length - 1][0].bTrim) {
                        let i = builders.length - 2;
                        while (i >= 0 && builders[i][2]) {
                            srcParent.removeChild(builders[i][1]);
                            builders.splice(i, 1);
                            i--;
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
                            const { start, lastMarker, bInit } = region, content = getText(region.env);
                            let text;
                            if (bInit && start != srcNode)
                                text = region.parent.insertBefore(document.createTextNode(content), start);
                            else {
                                (text = start).data = content;
                                region.start = start.nextSibling;
                            }
                            if (lastMarker) {
                                lastMarker.nextM = text;
                                region.lastMarker = null;
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
        this.RestoreContext(saved);
        return async function ChildNodes(region) {
            const savedEnv = SaveEnv();
            try {
                for (const [builder, node] of builders)
                    await this.CallWithErrorHandling(builder, node, region);
                this.builtNodeCount += builders.length;
            }
            finally {
                RestoreEnv(savedEnv);
            }
        };
    }
    CompileElement(srcParent, srcElm, bBlockLevel) {
        let builder = null;
        const reactOn = GetAttribute(srcElm, 'reacton') || GetAttribute(srcElm, 'reactson');
        try {
            const construct = this.Constructs.get(srcElm.tagName);
            if (construct)
                builder = this.CompileConstructInstance(srcParent, srcElm, construct);
            else
                switch (srcElm.nodeName) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            srcParent.removeChild(srcElm);
                            const rvarName = GetAttribute(srcElm, 'rvar');
                            const varName = rvarName || GetAttribute(srcElm, 'name') || GetAttribute(srcElm, 'var', true);
                            const getValue = this.CompileAttribute(srcElm, 'value');
                            const getStore = rvarName && this.CompileAttributeExpression(srcElm, 'store');
                            const newVar = this.NewVar(varName);
                            const bReact = GetAttribute(srcElm, 'react') != null;
                            builder = async function DEFINE(region) {
                                const { marker } = PrepareRegion(srcElm, region, undefined, undefined, varName);
                                if (region.bInit || bReact) {
                                    const value = getValue && getValue(region.env);
                                    marker.rValue = rvarName
                                        ? new _RVAR(this, null, value, getStore && getStore(region.env), rvarName)
                                        : value;
                                }
                                newVar(region.env)(marker.rValue);
                            };
                        }
                        break;
                    case 'IF':
                    case 'CASE':
                        {
                            const bHiding = CBool(srcElm.getAttribute('hiding'));
                            const caseList = [];
                            const getCondition = (srcElm.nodeName == 'IF') && this.CompileAttributeExpression(srcElm, 'cond', true);
                            const getValue = this.CompileAttributeExpression(srcElm, 'value');
                            const bodyNodes = [];
                            const bTrimLeft = this.bTrimLeft;
                            for (const child of srcElm.childNodes) {
                                if (child.nodeType == Node.ELEMENT_NODE) {
                                    const childElm = child;
                                    this.bTrimLeft = bTrimLeft;
                                    switch (child.nodeName) {
                                        case 'WHEN':
                                            const regMatch = childElm.getAttribute('regmatch');
                                            const regex = regMatch ? new RegExp(regMatch, 'i') : null;
                                            const cond = this.CompileAttributeExpression(childElm, 'cond', regMatch == null);
                                            caseList.push({
                                                condition: cond,
                                                regex,
                                                builder: this.CompileChildNodes(childElm, bBlockLevel),
                                                child: childElm
                                            });
                                            continue;
                                        case 'ELSE':
                                            caseList.push({
                                                condition: (_env) => true,
                                                regex: null,
                                                builder: this.CompileChildNodes(childElm, bBlockLevel),
                                                child: childElm
                                            });
                                            continue;
                                    }
                                }
                                bodyNodes.push(child);
                            }
                            if (getCondition)
                                caseList.unshift({
                                    condition: getCondition, regex: null,
                                    builder: this.CompileChildNodes(srcElm, bBlockLevel, bodyNodes),
                                    child: srcElm
                                });
                            builder =
                                async function CASE(region) {
                                    const value = getValue && getValue(region.env);
                                    let result = null;
                                    for (const alt of caseList)
                                        try {
                                            if ((!alt.condition || alt.condition(region.env))
                                                && (!alt.regex || alt.regex.test(value))) {
                                                result = alt;
                                                break;
                                            }
                                        }
                                        catch (err) {
                                            throw `${OuterOpenTag(alt.child)}${err}`;
                                        }
                                    if (bHiding) {
                                        let { start, bInit, env } = PrepareRegion(srcElm, region, null, region.bInit);
                                        for (const alt of caseList) {
                                            const bHidden = alt != result;
                                            let elm;
                                            if (!bInit || start == srcElm) {
                                                elm = start;
                                                start = start.nextSibling;
                                            }
                                            else
                                                region.parent.insertBefore(elm = document.createElement(alt.child.nodeName), start);
                                            elm.hidden = bHidden;
                                            if (!bHidden || bInit)
                                                await this.CallWithErrorHandling(alt.builder, alt.child, { parent: elm, start: elm.firstChild, bInit, env });
                                        }
                                    }
                                    else {
                                        const subregion = PrepareRegion(srcElm, region, result);
                                        if (result)
                                            await this.CallWithErrorHandling(result.builder, result.child, subregion);
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
                                C.Compile(parsedContent.body, this.Settings);
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
                            const mapComponents = new Map();
                            for (const child of srcElm.children) {
                                const signature = this.ParseSignature(child);
                                async function holdOn(region) {
                                    await task;
                                    await builders[0].call(this, region);
                                }
                                const builders = [holdOn];
                                mapComponents.set(child.tagName, [signature, builders, new RCompiler(this)]);
                                this.AddConstruct(signature);
                            }
                            const task = (async () => {
                                const response = await globalFetch(src);
                                const textContent = await response.text();
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html');
                                for (const libElm of parsedContent.body.children)
                                    if (libElm.tagName == 'COMPONENT') {
                                        const triple = mapComponents.get(libElm.firstElementChild.tagName);
                                        if (triple) {
                                            const [clientSig, instanceBuilders, compiler] = triple;
                                            compiler.Settings.bRunScripts = true;
                                            const { signature, elmTemplate, builders } = compiler.AnalyseComponent(libElm);
                                            if (!clientSig.Equals(signature))
                                                throw `Imported signature <${clientSig.TagName}> is unequal to library signature <${signature.TagName}>`;
                                            const instanceBuilder = compiler.CompileConstructTemplate(clientSig, elmTemplate.content, elmTemplate, false);
                                            this.bHasReacts || (this.bHasReacts = compiler.bHasReacts);
                                            instanceBuilders.length = 0;
                                            instanceBuilders.push(...builders.map((b) => b[0]), instanceBuilder);
                                            triple[2] = undefined;
                                        }
                                    }
                                for (const [tagName, triple] of mapComponents.entries())
                                    if (triple[2])
                                        throw `Component ${tagName} is missing in '${src}'`;
                            })();
                            srcParent.removeChild(srcElm);
                            builder = async function IMPORT({ env }) {
                                const constructEnv = CloneEnv(env);
                                for (const [{ TagName }, instanceBuilders] of mapComponents.values()) {
                                    const prevDef = env.constructDefs.get(TagName);
                                    const constructDef = { instanceBuilders, constructEnv };
                                    env.constructDefs.set(TagName, constructDef);
                                    constructEnv.constructDefs.set(TagName, constructDef);
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
                                        ...subregion,
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
                                    R.Compile(tempElm, { bRunScripts: true });
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
                        return this.CompileComponent(srcParent, srcElm);
                    default:
                        builder = this.CompileHTMLElement(srcElm);
                        break;
                }
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        if (reactOn) {
            this.bHasReacts = true;
            const getDependencies = reactOn.split(',').map(expr => this.CompileExpression(expr));
            const bodyBuilder = builder;
            builder = async function REACT(region) {
                let { parent, marker } = PrepareRegion(srcElm, region, null, null, 'reacton');
                await bodyBuilder.call(this, region);
                if (region.bInit) {
                    const subscriber = {
                        parent, marker,
                        builder: async function reacton(reg) {
                            await this.CallWithErrorHandling(bodyBuilder, srcElm, reg);
                        },
                        env: CloneEnv(region.env),
                    };
                    for (const getRvar of getDependencies) {
                        const rvar = getRvar(region.env);
                        rvar.Subscribe(subscriber);
                    }
                }
            };
        }
        if (builder)
            return [[builder, srcElm]];
        return [];
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
        if (srcElm.noModule || this.Settings.bRunScripts) {
            let script = srcElm.text;
            const defines = GetAttribute(srcElm, 'defines');
            if (defines) {
                for (let name of defines.split(',')) {
                    name = name.trim();
                    CheckValidIdentifier(name);
                    script += `globalThis.${name} = ${name};\n`;
                }
            }
            globalEval(`'use strict';${script}\n`);
        }
        return null;
    }
    CompileStyle(srcParent, srcElm) {
        srcParent.removeChild(srcElm);
        document.head.appendChild(srcElm);
        return null;
    }
    CompileForeach(srcParent, srcElm, bBlockLevel) {
        const varName = GetAttribute(srcElm, 'let');
        let indexName = srcElm.getAttribute('index');
        if (indexName == '')
            indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) {
                const getRange = this.CompileAttributeExpression(srcElm, 'of', true);
                let prevName = srcElm.getAttribute('previous');
                if (prevName == '')
                    prevName = 'previous';
                const bReactive = CBool(srcElm.getAttribute('updateable') ?? srcElm.getAttribute('reactive'), true);
                const getUpdatesTo = this.CompileAttributeExpression(srcElm, 'updates');
                const initVar = this.NewVar(varName);
                const initIndex = this.NewVar(indexName);
                const initPrevious = this.NewVar(prevName);
                const getKey = this.CompileAttributeExpression(srcElm, 'key');
                const getHash = this.CompileAttributeExpression(srcElm, 'hash');
                if (srcElm.childNodes.length == 0)
                    throw "FOREACH has an empty body.\nIf you placed <FOREACH> within a <table>, then the parser has rearranged these elements.\nUse <table.>, <tr.> etc instead.";
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
                        let index = 0, prevItem = null;
                        for (const [key, { item, hash }] of newMap) {
                            let rvar = (getUpdatesTo ? this.RVAR_Light(item, [getUpdatesTo(env)])
                                : bReactive ? this.RVAR_Light(item)
                                    : item);
                            setVar(rvar);
                            setIndex(index);
                            setPrevious(prevItem);
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
                                const lastMarker = subregion.lastMarker;
                                childRegion = PrepareRegion(null, subregion, null, false);
                                if (lastMarker)
                                    lastMarker.nextM = marker;
                                subregion.lastMarker = marker;
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
        const tagName = signature.TagName;
        this.AddConstruct(signature);
        const instanceBuilders = [
            this.CompileConstructTemplate(signature, elmTemplate.content, elmTemplate, false)
        ];
        builders.push([
            async function COMPONENT({ env }) {
                const construct = { instanceBuilders, constructEnv: undefined };
                const prevDef = env.constructDefs.get(tagName);
                env.constructDefs.set(tagName, construct);
                construct.constructEnv = CloneEnv(env);
                envActions.push(() => { env.constructDefs.set(tagName, prevDef); });
            },
            srcElm
        ]);
        return builders;
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
        for (const param of construct.Parameters)
            param.initVar = this.NewVar(bNewNames && GetAttribute(srcElm, param.name, true) || param.name);
        const restParam = construct.RestParam;
        if (restParam)
            restParam.initVar = this.NewVar(bNewNames && GetAttribute(srcElm, `...${restParam.name}`, true) || restParam.name);
        for (const S of construct.Slots.values())
            this.AddConstruct(S);
        try {
            return this.CompileChildNodes(contentNode);
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
        const tagName = signature.TagName;
        const { preModifiers } = this.CompileAttributes(srcElm);
        const computeParameters = [];
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
            computeParameters.push(pValue);
        }
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
                let i = 0;
                for (const param of signature.Parameters) {
                    param.initVar(constructEnv)(computeParameters[i](localEnv));
                    i++;
                }
                if (signature.RestParam) {
                    const rest = [];
                    for (const { modType, name, depValue } of preModifiers)
                        rest.push({ modType, name, value: depValue(localEnv) });
                    signature.RestParam.initVar(constructEnv)(rest);
                }
                if (signature.Slots.size) {
                    const slotEnv = CloneEnv(localEnv);
                    for (const slotName of signature.Slots.keys()) {
                        const savedDef = constructEnv.constructDefs.get(slotName);
                        constructEnv.constructDefs.set(slotName, { instanceBuilders: slotBuilders.get(slotName), constructEnv: slotEnv });
                        envActions.push(() => {
                            constructEnv.constructDefs.set(slotName, savedDef);
                        });
                    }
                }
                subregion.env = constructEnv;
                for (const builder of instanceBuilders)
                    await builder.call(this, subregion);
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
            const { parent, start, bInit, env, lastMarker } = region;
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
            if (lastMarker) {
                lastMarker.nextM = elm;
                region.lastMarker = null;
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
                else if (m = /^on(.*)$/i.exec(attrName))
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
                    const setter = this.CompileExpression(`function (){const ORx=this.${propName};if(${attr.value}!==ORx)${attr.value}=ORx}`);
                    preModifiers.push(m[1] == '*'
                        ? { modType: ModifierType.Event, name: null, depValue: setter, }
                        : { modType: ModifierType.Prop, name: propName, depValue: this.CompileExpression(attr.value) });
                    preModifiers.push({
                        modType: ModifierType.Event, name: m[2] ? 'onchange' : 'oninput', tag: propName, depValue: setter,
                    });
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
        const reg = /(?<![\\$])\$?\{(.*?)(?<!\\)\}|$/gs;
        let isBlank = true;
        while (reg.lastIndex < data.length) {
            const lastIndex = reg.lastIndex;
            const m = reg.exec(data);
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
    CompileAttributeExpression(elm, attName, bRequired) {
        return this.CompileExpression(GetAttribute(elm, attName, bRequired, true));
    }
    CompileAttribute(elm, attName, bRequired) {
        const value = elm.getAttribute(attName);
        if (value != null)
            return this.CompileInterpolatedString(value);
        return this.CompileAttributeExpression(elm, `#${attName}`, bRequired);
    }
    CompileExpression(expr, delims = "\"\"", bScript = false, bReturnErrors = false, name) {
        if (expr == null)
            return null;
        let depExpr = bScript
            ? `([${this.Context.join(',')}]) => {'use strict';${expr}\n}`
            : `([${this.Context.join(',')}]) => (${expr}\n)`;
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
function PrepareRegion(srcElm, region, result = null, bForcedClear = false, text) {
    let { parent, start, bInit, lastMarker } = region;
    let marker;
    if (bInit) {
        marker = region.lastMarker = parent.insertBefore(document.createComment(text ? `${srcElm?.tagName} ${text}` : srcElm.tagName), start);
        if (lastMarker)
            lastMarker.nextM = marker;
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
                this.rRuntime.DirtyRegions.add(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.bSomethingDirty = true;
        this.rRuntime.RUpdate();
    }
}
function CheckValidIdentifier(name) {
    if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(name))
        throw `Invalid identifier '${name}'`;
    if (/^(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/.test(name))
        throw `Reserved keyword '${name}'`;
}
const words = '(align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
    + '|clip|column|content|element|feature|fill|first|font|get|grid|image|inner|is|last|left|margin|max|min|node|offset|outer'
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
function thrower(err = 'Internal error') { throw err; }
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
export const docLocation = RVAR('docLocation');
function SetDocLocation() {
    docLocation.V = document.location.href;
    docLocation['subpath'] = document.location.pathname.substr(RootPath.length);
}
window.addEventListener('popstate', SetDocLocation);
export const reroute = globalThis.reroute = (arg) => {
    history.pushState(null, null, typeof arg == 'string' ? arg : arg.target.href);
    SetDocLocation();
    return false;
};
