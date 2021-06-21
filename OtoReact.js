const defaultSettings = {
    bAbortOnError: false,
    bShowErrors: true,
    bStripSpaces: true,
    bRunScripts: false,
};
export function RCompile(elm, settings) {
    try {
        const R = RHTML;
        R.Compile(elm, { ...defaultSettings, ...settings });
        orgSetTimeout(() => {
            const t0 = Date.now();
            R.Build({ parent: elm, start: elm.firstChild, end: null, env: [], });
            console.log(`Built ${R.builtNodeCount} nodes in ${Date.now() - t0} ms`);
        }, 0);
        return R;
    }
    catch (err) {
        window.alert(`Re-Act error: ${err}`);
    }
}
class Component {
    constructor(TagName, Parameters = [], Slots = []) {
        this.TagName = TagName;
        this.Parameters = Parameters;
        this.Slots = Slots;
    }
}
const globalEval = eval;
var ModifierType;
(function (ModifierType) {
    ModifierType[ModifierType["Attr"] = 0] = "Attr";
    ModifierType[ModifierType["Prop"] = 1] = "Prop";
    ModifierType[ModifierType["Class"] = 2] = "Class";
    ModifierType[ModifierType["Style"] = 3] = "Style";
    ModifierType[ModifierType["Event"] = 4] = "Event";
    ModifierType[ModifierType["Apply"] = 5] = "Apply";
    ModifierType[ModifierType["AddToStyle"] = 6] = "AddToStyle";
    ModifierType[ModifierType["AddToClassList"] = 7] = "AddToClassList";
})(ModifierType || (ModifierType = {}));
let num = 0;
class RCompiler {
    constructor(Context = [], Components = []) {
        this.Context = Context;
        this.Components = Components;
        this.instanceNum = num++;
        this.AllRegions = [];
        this.bCompiled = false;
        this.bHasReacts = false;
        this.DirtyRegions = new Set();
        this.bUpdating = false;
        this.handleUpdate = null;
        this.RUpdate = function RUpdate() {
            clearTimeout(this.handleUpdate);
            this.handleUpdate = orgSetTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 0);
        }.bind(this);
        this.RVAR = function (name, initialValue, storage) {
            let V = new _RVAR(this, name, initialValue, storage);
            if (!this.bUpdating)
                this.rvarList.push(V);
            return V;
        }.bind(this);
        this.rvarList = [];
        this.setTimeout = function (handler, timeout, ...args) {
            return orgSetTimeout(UpdateTimerHandler(this, handler), timeout, ...args);
        }.bind(this);
        this.setInterval = function (handler, timeout, ...args) {
            return orgSetInterval(UpdateTimerHandler(this, handler), timeout, ...args);
        }.bind(this);
        this.sourceNodeCount = 0;
        this.builtNodeCount = 0;
    }
    Compile(elm, settings) {
        this.settings = { ...defaultSettings, ...settings, };
        const t0 = Date.now();
        const savedRCompiler = RHTML;
        this.Builder = this.CompileChildNodes(elm);
        RHTML = savedRCompiler;
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
        this.bCompiled = true;
    }
    Build(reg) {
        let savedRCompiler = RHTML;
        RHTML = this;
        this.Builder(reg);
        this.AllRegions.push({
            parent: reg.parent, marker: reg.marker, end: null, builder: this.Builder, env: []
        });
        RHTML = savedRCompiler;
    }
    DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        if (!this.bHasReacts && this.bSomethingDirty)
            for (const s of this.AllRegions)
                this.DirtyRegions.add(s);
        else if (this.DirtyRegions.size == 0)
            return;
        const t0 = Date.now();
        this.builtNodeCount = 0;
        this.bUpdating = true;
        this.bSomethingDirty = false;
        let savedRCompiler = RHTML;
        RHTML = this;
        for (const { parent, marker, end, builder, env } of this.DirtyRegions) {
            try {
                builder.call(this, { parent, start: marker ? marker.nextSibling : parent.firstChild, end, env, });
            }
            catch (err) {
                const msg = `ERROR: ${err}`;
                console.log(msg);
            }
        }
        this.DirtyRegions.clear();
        RHTML = savedRCompiler;
        this.bUpdating = false;
        console.log(`Updated ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
    }
    RVAR_Light(t, subscribers = []) {
        if (!t._Subscribers) {
            t._Subscribers = subscribers;
            const R = this;
            Object.defineProperty(t, 'U', { get: function () {
                    for (const sub of t._Subscribers)
                        R.DirtyRegions.add(sub);
                    return t;
                }
            });
            t.Subscribe = function (sub) { t._Subscribers.push(sub); };
        }
        return t;
    }
    CompileChildNodes(srcParent) {
        const builders = [];
        const contextLength = this.Context.length;
        const componentsLength = this.Components.length;
        const childNodes = Array.from(srcParent.childNodes);
        for (const srcNode of childNodes) {
            let builder;
            switch (srcNode.nodeType) {
                case Node.ELEMENT_NODE:
                    const srcElm = srcNode;
                    try {
                        switch (srcElm.nodeName) {
                            case 'DEFINE':
                                {
                                    srcParent.removeChild(srcElm);
                                    const varName = OptionalAttribute(srcElm, 'name') ?? RequiredAttribute(srcElm, 'var');
                                    const getValue = this.CompileAttributeExpression(srcElm, 'value');
                                    const iVar = this.Context.push(varName) - 1;
                                    builder = function DEFINE(region) {
                                        region.env[iVar] = getValue(region.env);
                                    };
                                }
                                break;
                            case 'IF':
                                {
                                    const computeCondition = this.CompileAttributeExpression(srcElm, 'cond');
                                    const trThen = this.CompileChildNodes(srcElm);
                                    builder = function IF(region) {
                                        const { parent, env } = region;
                                        const result = computeCondition(region.env) ? true : false;
                                        const { start, end } = PrepareRegion(srcElm, region, result);
                                        if (result)
                                            trThen.call(this, { parent, start, end, env, });
                                    };
                                }
                                break;
                            case 'CASE':
                                {
                                    const caseList = [];
                                    for (const child of srcElm.children) {
                                        switch (child.nodeName) {
                                            case 'WHEN':
                                                caseList.push({
                                                    condition: this.CompileAttributeExpression(child, 'cond'),
                                                    builder: this.CompileChildNodes(child),
                                                    child
                                                });
                                                break;
                                            case 'ELSE':
                                                caseList.push({
                                                    condition: (_env) => true,
                                                    builder: this.CompileChildNodes(child),
                                                    child
                                                });
                                                break;
                                        }
                                    }
                                    builder = function CASE(region) {
                                        const { parent, env } = region;
                                        let result = null;
                                        for (const alt of caseList)
                                            try {
                                                if (alt.condition(region.env)) {
                                                    result = alt.builder;
                                                    break;
                                                }
                                            }
                                            catch (err) {
                                                throw `${OuterOpenTag(alt.child)}${err}`;
                                            }
                                        const { start, end } = PrepareRegion(srcElm, region, result);
                                        if (result)
                                            result.call(this, { parent, start, end, env, });
                                    };
                                }
                                break;
                            case 'FOREACH':
                                builder = this.CompileForeach(srcParent, srcElm);
                                break;
                            case 'INCLUDE':
                                {
                                    const src = RequiredAttribute(srcElm, 'src');
                                    const context = this.Context.slice(), components = this.Components.slice();
                                    let C = null;
                                    let arrToBuild = [];
                                    fetch(src)
                                        .then(async (response) => {
                                        const textContent = await response.text();
                                        const parser = new DOMParser();
                                        const parsedContent = parser.parseFromString(textContent, 'text/html');
                                        C = new RCompiler(context, components);
                                        C.Compile(parsedContent.body, this.settings);
                                        for (const { parent, start, end, env } of arrToBuild)
                                            if (parent.isConnected) {
                                                parent.removeChild(start);
                                                C.Builder({ parent, start: end, end, env, });
                                            }
                                        arrToBuild = null;
                                    });
                                    builder =
                                        function INCLUDE(region) {
                                            const { parent, env } = region;
                                            const { start, end } = PrepareRegion(srcElm, region);
                                            if (C?.Builder)
                                                C.Builder({ parent, start, end, env, });
                                            else
                                                arrToBuild.push({ parent, start, end, env: env.slice(), });
                                        };
                                }
                                break;
                            case 'REACT':
                                {
                                    this.bHasReacts = true;
                                    const expList = RequiredAttribute(srcElm, 'on', true).split(',');
                                    const getDependencies = expList.map(expr => this.CompileExpression(expr));
                                    const bodyBuilder = this.CompileChildNodes(srcElm);
                                    builder = function REACT(region) {
                                        const { parent, env } = region;
                                        let { start, end, marker, bInit } = PrepareRegion(srcElm, region);
                                        if (bInit) {
                                            if (start == srcElm) {
                                                start = srcElm.firstChild;
                                                srcElm.replaceWith(...srcElm.childNodes);
                                            }
                                            const subscriber = {
                                                parent, marker: marker, end,
                                                builder: bodyBuilder,
                                                env: env.slice(),
                                            };
                                            for (const getRvar of getDependencies) {
                                                const rvar = getRvar(env);
                                                rvar.Subscribe(subscriber);
                                            }
                                        }
                                        bodyBuilder.call(this, { parent, start, end, env, });
                                    };
                                }
                                break;
                            case 'RHTML':
                                {
                                    const bodyBuilder = this.CompileChildNodes(srcElm);
                                    builder = function RHTML(region) {
                                        const { parent, env } = region;
                                        const elm = document.createElement('RHTML');
                                        try {
                                            bodyBuilder.call(this, { parent: elm, start: null, end: null, env });
                                            const result = elm.innerText;
                                            const { marker, start, end, bUpdate } = PrepareRegion(srcElm, region, result);
                                            if (bUpdate) {
                                                elm.innerHTML = elm.innerText;
                                                const R = new RCompiler();
                                                R.Compile(elm, { ...defaultSettings, bRunScripts: true });
                                                R.Build({ parent, marker, start, end, env: [] });
                                            }
                                        }
                                        catch (err) {
                                            if (this.settings.bShowErrors)
                                                parent.insertBefore(document.createTextNode(err), region.start);
                                            else
                                                throw err;
                                        }
                                    };
                                }
                                break;
                            case 'WINDOW':
                            case 'PRINT':
                                { }
                                break;
                            case 'SCRIPT':
                                builder = this.CompileScript(srcParent, srcElm);
                                break;
                            case 'COMPONENT':
                                builders.push(...this.CompileComponent(srcParent, srcElm));
                                break;
                            default:
                                builder = this.CompileElement(srcParent, srcElm);
                                break;
                        }
                    }
                    catch (err) {
                        throw `${OuterOpenTag(srcElm)} ${err}`;
                    }
                    break;
                case Node.TEXT_NODE:
                    const str = srcNode.data.replace(/^\s+|\s+$/g, ' ');
                    const trExpres = this.CompileInterpolatedString(str);
                    builder = function Text(region) {
                        const { parent, start, end, env } = region;
                        const content = trExpres(env);
                        if (start == end)
                            parent.insertBefore(document.createTextNode(content), end);
                        else {
                            start.textContent = content;
                            region.start = start.nextSibling;
                        }
                    };
                    break;
                default:
                    srcNode.remove();
                    continue;
            }
            if (builder)
                builders.push([builder, srcNode]);
        }
        ;
        this.sourceNodeCount += childNodes.length;
        this.Components.length = componentsLength;
        this.Context.length = contextLength;
        return function ChildNodes(region) {
            const envLength = region.env.length;
            try {
                for (const [builder, node] of builders)
                    try {
                        builder.call(this, region);
                        const start = region.start;
                        if (start && start['RError']) {
                            region.start = start.nextSibling;
                            start.remove();
                        }
                    }
                    catch (err) {
                        const message = node instanceof HTMLElement ? `${OuterOpenTag(node, 40)}${err}` : err;
                        if (this.settings.bAbortOnError)
                            throw message;
                        console.log(message);
                        if (this.settings.bShowErrors)
                            region.parent.insertBefore(document.createTextNode(message), region.end)['RError'] = true;
                    }
                this.builtNodeCount += builders.length;
            }
            finally {
                region.env.length = envLength;
            }
        };
    }
    CompileScript(srcParent, srcElm) {
        srcParent.removeChild(srcElm);
        if (!(this.settings.bRunScripts || srcElm.hasAttribute('nomodule')))
            return null;
        const script = srcElm.textContent;
        let bDone = false;
        return function SCRIPT(_) {
            if (!bDone) {
                globalEval(`'use strict';${script}`);
                bDone = true;
            }
        };
    }
    CompileForeach(srcParent, srcElm) {
        const varName = OptionalAttribute(srcElm, 'let');
        if (!varName) {
            const ofExpression = OptionalAttribute(srcElm, 'of');
            const slot = this.Components.find(C => C.TagName == ofExpression);
            if (!slot)
                throw `Missing attribute [let]`;
            const bodyBuilder = this.CompileChildNodes(srcElm);
            srcParent.removeChild(srcElm);
            return function FOREACH_Slot(region) {
                const { parent, env } = region;
                let { start, end, } = PrepareRegion(srcElm, region);
                const subReg = { parent, start, end, env, };
                const slotBuilders = slot.Builders;
                for (let slotBuilder of slotBuilders) {
                    slot.Builders = [slotBuilder];
                    bodyBuilder.call(this, subReg);
                }
                slot.Builders = slotBuilders;
                region.start = end.nextSibling;
            };
        }
        else {
            ;
            ;
            ;
            const getRange = this.CompileAttributeExpression(srcElm, 'of');
            const indexName = srcElm.getAttribute('index');
            const prevName = srcElm.getAttribute('previous');
            const bUpdateable = CBool(srcElm.getAttribute('updateable'), true);
            const updatesTo = srcElm.getAttribute('updates');
            const getUpdatesTo = updatesTo && this.CompileExpression(updatesTo);
            const contextLength = this.Context.length;
            try {
                const iVar = this.Context.push(varName) - 1;
                const getKey = this.CompileExpression(srcElm.getAttribute('key'));
                const getHash = this.CompileExpression(srcElm.getAttribute('hash'));
                const iIndex = (indexName ? this.Context.push(indexName) : 0) - 1;
                const iPrevious = (prevName ? this.Context.push(prevName) : 0) - 1;
                if (srcElm.childNodes.length == 0)
                    throw "FOREACH has an empty body.\nIf you placed <FOREACH> within a <table>, then the parser has rearranged these elements.\nUse <table.>, <tr.> etc instead.";
                const bodyBuilder = this.CompileChildNodes(srcElm);
                srcParent.removeChild(srcElm);
                return function FOREACH(region) {
                    const { parent, env } = region;
                    let { marker, start, end, bInit } = PrepareRegion(srcElm, region, null, (getKey == null));
                    const subReg = { parent, start, end, env, };
                    let index = 0, prevItem = null;
                    const keyMap = (bInit ? marker['keyMap'] = new Map() : marker['keyMap']);
                    const newMap = new Map();
                    for (const item of getRange(env)) {
                        env[iVar] = item;
                        const hash = getHash && getHash(env);
                        const key = getKey ? getKey(env) : hash;
                        newMap.set(key ?? {}, [item, hash]);
                    }
                    function RemoveStaleItemsHere() {
                        let key;
                        while (start != end && start && !newMap.has(key = start['key'])) {
                            if (key != null)
                                keyMap.delete(key);
                            let node = start;
                            start = start['endNode'].nextSibling;
                            while (node != start) {
                                const next = node.nextSibling;
                                parent.removeChild(node);
                                node = next;
                            }
                        }
                    }
                    RemoveStaleItemsHere();
                    for (const [key, [item, hash]] of newMap) {
                        let rvar = (getUpdatesTo ? this.RVAR_Light(item, Array.from(getUpdatesTo(env).Subscribers))
                            : bUpdateable ? this.RVAR_Light(item)
                                : item);
                        env[iVar] = rvar;
                        if (iIndex >= 0)
                            env[iIndex] = index;
                        if (iPrevious >= 0)
                            env[iPrevious] = prevItem;
                        let marker;
                        let subscriber = keyMap.get(key);
                        if (subscriber && subscriber.marker.isConnected) {
                            marker = subscriber.marker;
                            if (marker != start) {
                                let node = marker.nextSibling;
                                marker = parent.insertBefore(marker, start);
                                while (node != subscriber.end) {
                                    const next = node.nextSibling;
                                    parent.insertBefore(node, start);
                                    node = next;
                                }
                            }
                            marker.textContent = `${varName}(${index})`;
                            subReg.start = marker.nextSibling;
                            subReg.end = subscriber.end;
                        }
                        else {
                            marker = parent.insertBefore(document.createComment(`${varName}(${index})`), start);
                            const endMarker = parent.insertBefore(document.createComment(`/${varName}`), start);
                            marker['key'] = key;
                            marker['endNode'] = subReg.start = subReg.end = endMarker;
                            subscriber = {
                                parent,
                                marker,
                                end: endMarker,
                                builder: (bUpdateable ? bodyBuilder : undefined),
                                env: (bUpdateable ? env.slice() : undefined),
                            };
                            if (key != null) {
                                if (keyMap.has(key))
                                    throw `Duplicate key '${key}'`;
                                keyMap.set(key, subscriber);
                            }
                        }
                        if (hash != null
                            && (hash == marker['hash']
                                || (marker['hash'] = hash, false))) { }
                        else
                            bodyBuilder.call(this, subReg);
                        start = subReg.end.nextSibling;
                        if (bUpdateable)
                            rvar.Subscribe(subscriber);
                        prevItem = item;
                        index++;
                        RemoveStaleItemsHere();
                    }
                    env.length = contextLength;
                    region.start = end.nextSibling;
                };
            }
            finally {
                this.Context.length = contextLength;
            }
        }
    }
    ParseSignature(elmSignature) {
        const comp = new Component(elmSignature.tagName);
        for (const attr of elmSignature.attributes)
            comp.Parameters.push(/^#/.test(attr.name)
                ? { pid: attr.nodeName.substr(1), pdefault: attr.value ? this.CompileExpression(attr.value) : null }
                : { pid: attr.nodeName, pdefault: attr.value ? this.CompileInterpolatedString(attr.value) : null });
        for (const elmSlot of elmSignature.children)
            comp.Slots.push(this.ParseSignature(elmSlot));
        return comp;
    }
    CompileComponent(srcParent, srcElm) {
        srcParent.removeChild(srcElm);
        const builders = [];
        let elmSignature = srcElm.firstElementChild;
        if (elmSignature?.tagName == 'SIGNATURE')
            elmSignature = elmSignature.firstElementChild;
        if (!elmSignature || elmSignature.tagName == 'TEMPLATE')
            throw `Missing signature`;
        const component = this.ParseSignature(elmSignature);
        for (let srcChild of srcElm.children)
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    const builder = this.CompileScript(srcElm, srcChild);
                    if (builder)
                        builders.push([builder, srcChild]);
                    break;
                case 'STYLE':
                    break;
            }
        this.Components.push(component);
        const template = RequiredChildElement(srcElm, 'TEMPLATE');
        this.Context.push(...component.Parameters.map(p => p.pid));
        this.Components.push(...component.Slots);
        try {
            component.Builders = [this.CompileChildNodes(template.content)];
        }
        catch (err) {
            throw `${OuterOpenTag(template)} ${err}`;
        }
        finally {
            this.Components.length -= component.Slots.length;
            this.Context.length -= component.Parameters.length;
        }
        builders.push([function (reg) {
                component.ComponentEnv = reg.env.slice();
            }, srcElm]);
        return builders;
    }
    CompileElement(srcParent, srcElm) {
        for (let i = this.Components.length - 1; i >= 0; i--) {
            const component = this.Components[i];
            if (component.TagName == srcElm.tagName) {
                srcParent.removeChild(srcElm);
                const contextLength = this.Context.length;
                let attVal;
                const computeParameters = [];
                for (const { pid, pdefault } of component.Parameters)
                    try {
                        computeParameters.push(((attVal = srcElm.getAttribute(`#${pid}`)) != null
                            ? this.CompileExpression(attVal)
                            : (attVal = srcElm.getAttribute(pid)) != null
                                ? this.CompileInterpolatedString(attVal)
                                : pdefault
                                    ? (_env) => pdefault(component.ComponentEnv)
                                    : thrower(`Missing parameter [${pid}]`)));
                    }
                    catch (err) {
                        throw `[${pid}]: ${err}`;
                    }
                const slotBuilders = component.Slots.map(slot => {
                    const slotBuilderArray = [];
                    for (let slotElm of srcElm.children)
                        if (slotElm.tagName == slot.TagName)
                            try {
                                for (const param of slot.Parameters)
                                    this.Context.push(RequiredAttribute(slotElm, param.pid) || param.pid);
                                slotBuilderArray.push(this.CompileChildNodes(slotElm));
                            }
                            catch (err) {
                                throw `${OuterOpenTag(slotElm)} ${err}`;
                            }
                            finally {
                                this.Context.length = contextLength;
                            }
                    return slotBuilderArray;
                });
                return (region) => {
                    const { parent, env } = region;
                    const { start, end } = PrepareRegion(srcElm, region);
                    component.ComponentEnv.push(...computeParameters.map(arg => arg(env)));
                    try {
                        const prevBuilders = [];
                        let i = 0;
                        for (const slot of component.Slots) {
                            prevBuilders.push(slot.Builders);
                            slot.Builders = slotBuilders[i++];
                            slot.ComponentEnv = env.slice();
                        }
                        try {
                            for (let builder of component.Builders)
                                builder.call(this, { parent, start, end, env: component.ComponentEnv, });
                        }
                        finally {
                            for (const slot of component.Slots)
                                slot.Builders = prevBuilders.shift();
                        }
                    }
                    finally {
                        component.ComponentEnv.length -= component.Parameters.length;
                    }
                };
            }
        }
        {
            const nodeName = srcElm.nodeName.replace(/\.$/, '');
            const arrModifiers = [];
            for (const attr of srcElm.attributes) {
                const attrName = attr.name;
                let m;
                try {
                    if (m = /^on(.*)$/i.exec(attrName)) {
                        const oHandler = this.CompileExpression(`function ${attrName}(event){${CheckForComments(attr.value)}}`);
                        arrModifiers.push({
                            modType: ModifierType.Event, name: m[1],
                            depValue: oHandler
                        });
                    }
                    else if (m = /^#class:(.*)$/.exec(attrName))
                        arrModifiers.push({
                            modType: ModifierType.Class, name: m[1],
                            depValue: this.CompileExpression(attr.value)
                        });
                    else if (m = /^#style\.(.*)$/.exec(attrName))
                        arrModifiers.push({
                            modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                            depValue: this.CompileExpression(attr.value)
                        });
                    else if (attrName == '+style')
                        arrModifiers.push({
                            modType: ModifierType.AddToStyle, name: null,
                            depValue: this.CompileExpression(attr.value)
                        });
                    else if (m = /^#(.*)/.exec(attrName))
                        arrModifiers.push({
                            modType: ModifierType.Prop, name: CapitalizeProp(m[1]),
                            depValue: this.CompileExpression(attr.value)
                        });
                    else if (attrName == "+class")
                        arrModifiers.push({
                            modType: ModifierType.AddToClassList, name: null,
                            depValue: this.CompileExpression(attr.value)
                        });
                    else if (attrName == "apply")
                        arrModifiers.push({
                            modType: ModifierType.Apply, name: null,
                            depValue: this.CompileExpression(`function apply(){${CheckForComments(attr.value)}}`)
                        });
                    else if (m = /^\*(\*)?(.*)$/.exec(attrName)) {
                        const propName = CapitalizeProp(m[2]);
                        const setter = this.CompileExpression(`function (){${attr.value} = this.${propName}; }`);
                        arrModifiers.push({
                            modType: ModifierType.Apply, name: null,
                            depValue: setter,
                        });
                        arrModifiers.push({
                            modType: ModifierType.Event, name: m[1] ? 'change' : 'input', tag: propName, depValue: setter,
                        });
                    }
                    else if (m = /^@(@)?(.*)$/.exec(attrName)) {
                        const propName = CapitalizeProp(m[2]);
                        const setter = this.CompileExpression(`function (){${attr.value} = this.${propName}; }`);
                        arrModifiers.push({
                            modType: ModifierType.Prop, name: propName,
                            depValue: this.CompileExpression(attr.value)
                        });
                        arrModifiers.push({
                            modType: ModifierType.Event, name: m[1] ? 'change' : 'input', tag: propName, depValue: setter,
                        });
                    }
                    else
                        arrModifiers.push({
                            modType: ModifierType.Attr, name: attrName,
                            depValue: this.CompileInterpolatedString(attr.value)
                        });
                }
                catch (err) {
                    throw (`[${attrName}]: ${err}`);
                }
            }
            const childnodesBuilder = this.CompileChildNodes(srcElm);
            return function Element(region) {
                const { parent, start, end, env, } = region;
                let elm, bNew;
                if (bNew = (start == end)) {
                    elm = document.createElement(nodeName);
                    parent.insertBefore(elm, end);
                }
                else {
                    region.start = start.nextSibling;
                    if (start.nodeName != nodeName) {
                        elm = document.createElement(nodeName);
                        parent.replaceChild(elm, srcElm);
                        bNew = true;
                    }
                    else {
                        elm = start;
                        elm.classList.remove(...elm.classList);
                    }
                }
                childnodesBuilder.call(this, { parent: elm, start: elm.firstChild, end: null, env, });
                for (const mod of arrModifiers) {
                    const attName = mod.name;
                    try {
                        const val = mod.depValue(env);
                        switch (mod.modType) {
                            case ModifierType.Attr:
                                elm.setAttribute(attName, val ?? '');
                                break;
                            case ModifierType.Prop:
                                if (val != null)
                                    elm[attName] = val;
                                else
                                    delete elm[attName];
                                break;
                            case ModifierType.Event:
                                {
                                    const tag = `$$${mod.tag ?? attName}`;
                                    let prevHandler;
                                    if (prevHandler = elm[tag])
                                        elm.removeEventListener(attName, prevHandler);
                                    elm.addEventListener(attName, elm[tag] = UpdateHandler(this, val.bind(elm)));
                                }
                                break;
                            case ModifierType.Class:
                                if (val)
                                    elm.classList.add(attName);
                                break;
                            case ModifierType.Style:
                                if (val)
                                    elm.style[attName] = val;
                                else
                                    delete elm.style[attName];
                                break;
                            case ModifierType.Apply:
                                val.call(elm);
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
                        }
                    }
                    catch (err) {
                        throw `[${attName}]: ${err}`;
                    }
                }
                if (nodeName == 'SCRIPT')
                    elm.text = elm.textContent;
            };
        }
    }
    CompileInterpolatedString(data, name) {
        const generators = [];
        function addString(s) {
            generators.push(s.replace(/\\(?=[{}\\])/g, ''));
        }
        const reg = /(?<!\\)\{(.*?)(?<!\\)\}|$/gs;
        while (reg.lastIndex < data.length) {
            const lastIndex = reg.lastIndex;
            const m = reg.exec(data);
            const fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed)
                addString(fixed);
            if (m[1])
                generators.push(this.CompileExpression(m[1], '{}', null, true));
        }
        return (env) => {
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
    }
    CompileAttributeExpression(elm, attName) {
        return this.CompileExpression(RequiredAttribute(elm, attName, true));
    }
    CompileExpression(expr, delims = "\"\"", bScript = false, bReturnErrors = false, name) {
        if (expr == null)
            return null;
        expr = CheckForComments(expr);
        let depExpr = bScript
            ? `([${this.Context.join(',')}]) => {'use strict';${expr}}`
            : `([${this.Context.join(',')}]) => (${expr})`;
        const errorInfo = `${name ? `[${name}] ` : ''}${delims[0]}${Abbreviate(expr, 60)}${delims[1]}: `;
        try {
            const routine = globalEval(depExpr);
            return (env) => {
                try {
                    return routine(env);
                }
                catch (err) {
                    const message = `${errorInfo}${err}`;
                    if (bReturnErrors && !this.settings.bAbortOnError) {
                        console.log(message);
                        return (this.settings.bShowErrors ? message : "");
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
}
function PrepareRegion(srcElm, region, result = null, bForcedClear = false) {
    let { parent, start } = region;
    let marker, end, bInit, bUpdate;
    if (bInit = !(start && (end = start['endNode']))) {
        marker = parent.insertBefore(document.createComment(srcElm.tagName), start);
        end = parent.insertBefore(document.createComment(`/${srcElm.tagName}`), start == srcElm ? srcElm.nextSibling : start);
        marker['endNode'] = end;
    }
    else {
        marker = start;
    }
    start = marker.nextSibling;
    region.start = end.nextSibling;
    if (bUpdate = (bForcedClear || (result != marker['result'] ?? null))) {
        marker['result'] = result;
        while (start != end) {
            const next = start.nextSibling;
            parent.removeChild(start);
            start = next;
        }
    }
    return { marker, start, end, bInit, bUpdate };
}
function UpdateHandler(R, handler) {
    return handler &&
        function ReactiveHandler(ev) {
            const result = handler(ev);
            if (result instanceof Promise) {
                result.then(R.RUpdate);
                ev.preventDefault();
                return;
            }
            R.RUpdate();
            if (result === false)
                ev.preventDefault();
            return result;
        };
}
class _RVAR {
    constructor(rRuntime, name, initialValue, storage) {
        this.rRuntime = rRuntime;
        this.name = name;
        this.storage = storage;
        this.Subscribers = new Set();
        if (name) {
            globalThis[name] = this;
        }
        let s;
        if ((s = storage?.getItem(`RVAR_${name}`)) != null)
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
            this.storage?.setItem(`RVAR_${this.name}`, JSON.stringify(t));
        }
    }
    get U() { this.SetDirty(); return this._Value; }
    set U(t) { this.V = t; this.rRuntime.RUpdate(); }
    SetDirty() {
        for (const sub of this.Subscribers)
            if (sub.parent.isConnected)
                this.rRuntime.DirtyRegions.add(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.bSomethingDirty = true;
    }
}
function UpdateTimerHandler(R, handler) {
    return function (...args) {
        const result = handler(...args);
        if (result instanceof Promise)
            result.then(R.RUpdate);
        else
            R.RUpdate();
    };
}
function CapitalizeProp(lcName) {
    let m;
    lcName = lcName.replace('html', 'HTML');
    while (m = /^(.*(align|animation|aria|background|border|bottom|class|client|column|content|element|font|image|inner|left|right|rule|top|value))([a-z])(.*)$/.exec(lcName))
        lcName = `${m[1]}${m[3].toUpperCase()}${m[4]}`;
    return lcName;
}
function CheckForComments(script) {
    const hasComments = /\/\/[^\n]*$/.test(script);
    return hasComments ? script + '\n' : script;
}
function RequiredAttribute(elm, name, bHashAllowed = false) {
    let value = elm.getAttribute(name);
    if (value == null && bHashAllowed) {
        name = `#${name}`;
        value = elm.getAttribute(name);
    }
    if (value == null)
        throw `Missing attribute [${name}]`;
    return value;
}
function OptionalAttribute(elm, name) {
    return elm.getAttribute(name);
}
function RequiredChildElement(elm, name) {
    const result = OptionalChildElement(elm, name);
    if (!result)
        throw `Missing child element <${name}>`;
    return result;
}
function OptionalChildElement(elm, name) {
    let child = elm.firstElementChild;
    let result = null;
    while (child) {
        if (name == '*' || child.tagName == name) {
            if (result)
                throw `Multiple child elements <${name}>`;
            result = child;
        }
        child = child.nextElementSibling;
    }
    return result;
}
function OuterOpenTag(elm, maxLength) {
    return Abbreviate(/<.*?>/.exec(elm.outerHTML)[0], maxLength);
}
function Abbreviate(s, maxLength) {
    if (maxLength && s.length > maxLength)
        return s.substr(0, maxLength - 3) + "...";
    return s;
}
function CBool(s, valOnEmpty) {
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
function thrower(err) { throw err; }
const orgSetTimeout = setTimeout;
const orgSetInterval = setInterval;
export let RHTML = new RCompiler();
export let RVAR = RHTML.RVAR;
export let RUpdate = RHTML.RUpdate;
Object.defineProperties(globalThis, {
    RVAR: { get: () => RHTML.RVAR },
    RUpdate: { get: () => RHTML.RUpdate },
    setTimeOut: { get: () => RHTML.setTimeout },
    setInterval: { get: () => RHTML.setInterval },
});
globalThis.RCompile = RCompile;
export function* range(from, to, step = 1) {
    if (to === undefined) {
        to = from;
        from = 0;
    }
    for (let i = from; i < to; i += step)
        yield i;
}
globalThis.range = range;
