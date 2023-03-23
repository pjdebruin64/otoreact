const U = undefined, N = null, T = true, F = false, Q = '', E = [], W = window, D = document, L = location, G = self, US = "'use strict';", dflts = {
    bShowErrors: T,
    bAutoSubscribe: T,
    bAutoPointer: T,
    preformatted: E,
    storePrefix: "RVAR_"
}, P = new DOMParser(), Ev = eval, ass = Object.assign, now = () => performance.now(), thro = (err) => { throw err; };
class Range {
    constructor(ar, node, text) {
        this.text = text;
        this.node = node;
        if (ar) {
            let { parR: p, prvR: q } = ar;
            if (p && !p.node)
                this.parR = p;
            if (q)
                q.nx = this;
            else if (p)
                p.ch = this;
            ar.prvR = this;
        }
    }
    toString() { return this.text || this.node?.nodeName; }
    get Fst() {
        let { node: f, ch: c } = this;
        while (!f && c) {
            f = c.Fst;
            c = c.nx;
        }
        return f;
    }
    get Nxt() {
        let r = this, n, p;
        do {
            p = r.parR;
            while (r = r.nx)
                if (n = r.Fst)
                    return n;
        } while (r = p);
    }
    get FstOrNxt() {
        return this.Fst || this.Nxt;
    }
    Nodes() {
        return (function* Nodes(r) {
            let c;
            if (r.node)
                yield r.node;
            else if (c = r.ch)
                do {
                    yield* Nodes(c);
                } while (c = c.nx);
        })(this);
    }
    erase(par) {
        let { node, ch: c } = this;
        if (node && par) {
            par.removeChild(node);
            par = N;
        }
        this.ch = N;
        while (c) {
            if (c.bfD)
                c.bfD.call(c.node || par);
            c.rvars?.forEach(rv => rv._Subs.delete(c.subs));
            c.erase(c.parN || par);
            if (c.afD)
                c.afD.call(c.node || par);
            c = c.nx;
        }
    }
}
class Context {
    constructor(C, a) {
        ass(this, C || {
            d: 0, L: 0, M: 0, ct: Q,
            lvMap: new Map(), csMap: new Map()
        });
        if (a && C) {
            this.lvMap = new Map(this.lvMap);
            this.csMap = new Map(this.csMap);
        }
    }
    getV(k) {
        if (k) {
            let d = this.d;
            return (e = env) => {
                let [F, i] = k;
                for (; F < d; F++)
                    e = e[0];
                return e[i];
            };
        }
    }
    getLV(nm) {
        return this.getV(this.lvMap.get(nm) || thro(`Unknown name '${nm}'`));
    }
    getCS(nm) {
        let SK = this.csMap.get(nm);
        return SK && { S: SK.S, dC: this.getV(SK.k) };
    }
    max(C) {
        return ass(C.L > this.L ? C : this, {
            M: Math.min(this.M, C.M)
        });
    }
}
export async function RCompile(srcN = D.body, setts) {
    if (srcN.isConnected && !srcN.hndlrs)
        try {
            srcN.hndlrs = [];
            let m = L.href.match(`^.*(${setts?.basePattern || '/'})`), C = new RComp(N, L.origin + (DL.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, Q) : Q), setts);
            await C.Compile(srcN);
            Jobs.add({ Exec: async () => {
                    srcN.innerHTML = Q;
                    await C.Build({
                        parN: srcN.parentElement,
                        srcN,
                        bfor: srcN
                    });
                    ScrollToHash();
                } });
            DoUpdate();
        }
        catch (e) {
            alert(`OtoReact compile error: ` + Abbr(e, 1000));
        }
}
const PrepRng = (ar, srcE, text = Q, nWipe, res) => {
    let { parN, r, bR } = ar, sub = { parN, bR }, cr = !r;
    if (cr) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        r = sub.parR = new Range(ar, N, srcE ? srcE.tagName + (text && ' ' + text) : text);
    }
    else {
        sub.r = r.ch || T;
        ar.r = r.nx || T;
        if (cr = nWipe && (nWipe > 1 || res != r.res)) {
            (sub.parR = r).erase(parN);
            sub.r = N;
            sub.bfor = r.Nxt;
        }
    }
    r.res = res;
    return { r, sub, cr };
}, PrepElm = (ar, tag, elm) => {
    let r = ar.r, cr = !r;
    if (cr)
        r = new Range(ar, elm
            || ar.parN.insertBefore(D.createElement(tag), ar.bfor));
    else
        ar.r = r.nx || T;
    nodeCnt++;
    return {
        r,
        chAr: {
            parN: parN = r.node,
            r: r.ch,
            bfor: N,
            parR: r
        },
        cr
    };
}, PrepData = (ar, data, bC) => {
    let r = ar.r;
    if (!r)
        new Range(ar, ar.parN.insertBefore(bC ? D.createComment(data) : D.createTextNode(data), ar.bfor));
    else {
        r.node.data = data;
        ar.r = r.nx || T;
    }
    nodeCnt++;
}, dU = _ => U, dB = async () => { }, chiWins = new Set(), OMods = new Map();
function SetLVars(vars, data) {
    vars.forEach((v, i) => v(data[i]));
}
class Signat {
    constructor(srcE) {
        this.srcE = srcE;
        this.Params = [];
        this.Slots = new Map();
        this.nm = srcE.tagName;
    }
    IsCompat(sig) {
        if (!sig)
            return;
        let c = T, mParams = new Map(mapI(sig.Params, p => [p.nm, p.pDf]));
        for (let { nm, pDf } of this.Params)
            if (mParams.has(nm)) {
                c && (c = !pDf || mParams.get(nm));
                mParams.delete(nm);
            }
            else
                c = F;
        for (let pDf of mParams.values())
            c && (c = pDf);
        for (let [nm, slotSig] of this.Slots)
            c && (c = sig.Slots.get(nm)?.IsCompat(slotSig));
        return c;
    }
}
export class _RVAR {
    constructor(name, init, store, storeNm) {
        this._Imm = new Set();
        this._Subs = new Set();
        this.name = name || storeNm;
        if (name)
            G[name] = this;
        if (store) {
            let sNm = storeNm ||
                'RVAR_' + name, s = store.getItem(sNm);
            if (s)
                try {
                    init = JSON.parse(s);
                }
                catch { }
            this.Subscribe(v => store.setItem(sNm, JSON.stringify(v ?? N)));
        }
        init instanceof Promise ?
            init.then(v => this.V = v, on.e)
            : (this.v = init);
    }
    Subscribe(s, bImm, cr) {
        if (s) {
            if (cr)
                s(this.v);
            (bImm ? this._Imm : this._Subs).add(s);
        }
        return this;
    }
    Unsubscribe(s) {
        this._Imm.delete(s);
        this._Subs.delete(s);
    }
    get V() { return this.v; }
    set V(v) {
        if (v !== this.v) {
            this.v = v;
            this.SetDirty();
        }
    }
    get Set() {
        return t => t instanceof Promise ?
            ((this.V = U), t.then(v => this.V = v, on.e))
            : (this.V = t);
    }
    get Clear() {
        return () => Jobs.has(this) || (this.V = U);
    }
    get U() {
        ro || this.SetDirty();
        return this.v;
    }
    set U(t) { this.v = t; this.SetDirty(); }
    SetDirty() {
        for (let sub of this._Imm)
            sub(this.v);
        if (this._Subs.size) {
            Jobs.add(this);
            RUpd();
        }
    }
    async Exec() {
        for (let subs of this._Subs)
            try {
                let P = subs(this.V);
                if (subs.ar)
                    await P;
            }
            catch (e) {
                console.log(e = `ERROR: ` + Abbr(e, 1000));
                alert(e);
            }
    }
    toString() {
        return this.v?.toString() ?? Q;
    }
}
function Subscriber({ parN, parR }, b, r, re = 1) {
    let ar = { parN, parR, r: r || T }, eon = { env, on };
    return ass(() => (({ env, on } = eon),
        b({ ...ar }, re)), { ar });
}
let env, parN, on = { e: N, s: N }, Jobs = new Set(), hUpdate, ro = F, upd = 0, nodeCnt = 0, start, NoTime = (prom) => {
    let t = now();
    return prom.finally(() => { start += now() - t; });
}, RUpd = () => {
    if (!env && !hUpdate)
        hUpdate = setTimeout(DoUpdate, 1);
};
export async function DoUpdate() {
    hUpdate = N;
    if (Jobs.size && !env) {
        env = E;
        nodeCnt = 0;
        let u0 = upd;
        start = now();
        while (Jobs.size) {
            let J = Jobs;
            Jobs = new Set();
            if (upd++ - u0 > 25) {
                alert('Infinite react-loop');
                break;
            }
            for (let j of J)
                await j.Exec();
        }
        if (nodeCnt)
            R?.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        env = U;
    }
}
export function RVAR(nm, value, store, subs, storeName) {
    return new _RVAR(nm, value, store, storeName).Subscribe(subs, T);
}
const RV_props = {
    V: { get: function () { return this; } },
    U: { get: function () {
            if (!ro) {
                Jobs.add(this);
                this._UpdTo?.forEach(rv => rv.SetDirty());
                RUpd();
            }
            return this;
        }
    },
    Exec: { value: _RVAR.prototype.Exec },
    Subscribe: { value: function (sub) {
            this._Subs.add(sub);
        } },
};
function RVAR_Light(t, updTo) {
    if (!t._Subs) {
        t._Subs = new Set();
        t._UpdTo = updTo;
        Object.defineProperties(t, RV_props);
    }
    return t;
}
function ApplyMod(elm, M, val, cr) {
    let { mt, nm } = M;
    nm = M.c || (M.c = mt == 4 && ChkNm(elm.style, nm)
        || (mt == 1 || mt == 5)
            && ChkNm(elm, nm == 'valueasnumber' && elm.type == 'number'
                ? 'value' : nm)
        || nm);
    switch (mt) {
        case 0:
            elm.setAttribute(nm, val);
            break;
        case 2:
            elm.setAttribute('src', new URL(val, nm).href);
            break;
        case 1:
            if (M.isS ?? (M.isS = typeof elm[nm] == 'string'))
                if (val == N)
                    val = Q;
                else
                    val = val.toString();
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case 5:
            let m;
            if (val)
                if (m = /^on(input|change)$/.exec(nm)) {
                    elm.addEventListener(m[1], val);
                    (elm.hndlrs || (elm.hndlrs = [])).push({ evType: m[1], listener: val });
                }
                else {
                    elm[nm] = val;
                    if (nm == 'onclick' && R.setts.bAutoPointer)
                        elm.style.cursor = val && !elm.disabled ? 'pointer' : N;
                }
            break;
        case 3:
            val && elm.classList.add(nm);
            break;
        case 4:
            elm.style[nm] = val || val === 0 ? val : N;
            break;
        case 6:
            if (val)
                for (let [nm, v] of Object.entries(val))
                    elm.style[nm] = v || v === 0 ? v : N;
            break;
        case 7:
            (function ACL(v) {
                if (v)
                    switch (typeof v) {
                        case 'string':
                            elm.classList.add(v);
                            break;
                        case 'object':
                            if (v)
                                if (Array.isArray(v))
                                    v.forEach(ACL);
                                else
                                    for (let [nm, b] of Object.entries(v))
                                        b && ACL(nm);
                            break;
                        default: throw `Invalid value`;
                    }
            })(val);
            break;
        case 8:
            for (let { M, v } of val || E)
                ApplyMod(elm, M, v, cr);
            break;
        case 9:
            cr && val.call(elm);
            break;
        case 10:
            !cr && val.call(elm);
    }
}
function ApplyMods(elm, mods, cr) {
    ro = T;
    try {
        for (let M of mods)
            ApplyMod(elm, M, M.depV(), cr);
    }
    finally {
        ro = F;
    }
}
class RComp {
    constructor(RC, FilePath, settings, CT = RC?.CT) {
        this.num = RComp.iNum++;
        this.cRvars = {};
        this.rActs = [];
        this.setPRE = new Set(['PRE']);
        this.ws = 1;
        this.rspc = T;
        this.srcNodeCnt = 0;
        this.setts = { ...RC ? RC.setts : dflts, ...settings };
        this.FilePath = FilePath || RC?.FilePath;
        this.doc = RC?.doc || D;
        this.head = RC?.head || this.doc.head;
        this.CT = new Context(CT, T);
    }
    Framed(Comp) {
        let { CT, rActs } = this, { ct, d, L, M } = CT, A = rActs.length, nf = L - M;
        if (nf) {
            CT.ct = `[${ct}]`;
            CT.d++;
            CT.L = CT.M = 0;
        }
        return Comp((sub, r) => {
            r || ({ r, sub } = PrepRng(sub));
            let e = env;
            env = r.val || (r.val = [nf ? e : e[0]]);
            return { sub, ES: () => { env = e; } };
        }).finally(() => {
            ass(this.CT = CT, { ct, d, L, M });
            while (rActs.length > A)
                rActs.pop()();
        });
    }
    SS() {
        let { CT, rActs } = this, { ct, L } = CT, A = rActs.length;
        return () => {
            CT.ct = ct
                + ','.repeat(CT.L - L);
            while (rActs.length > A)
                rActs.pop()();
        };
    }
    LVar(nm) {
        if (!(nm = nm?.trim()))
            var lv = dU;
        else {
            if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm))
                throw `Invalid identifier '${nm}'`;
            try {
                Ev(US + `let ${nm}=0`);
            }
            catch {
                throw `Reserved keyword '${nm}'`;
            }
            let { CT } = this, L = ++CT.L, vM = CT.lvMap, p = vM.get(nm);
            vM.set(nm, [CT.d, L]);
            this.rActs.push(() => mapSet(vM, nm, p));
            CT.ct = CT.ct.replace(new RegExp(`\\b${nm}\\b`), Q)
                + ',' + nm;
            lv = (v => (env[L] = v));
        }
        lv.nm = nm;
        return lv;
    }
    LVars(varlist) {
        return Array.from(split(varlist), nm => this.LVar(nm));
    }
    LCons(listS) {
        let { CT } = this, { csMap: cM, M } = CT;
        for (let S of listS) {
            let p = cM.get(S.nm);
            cM.set(S.nm, { S, k: [CT.d, --CT.M] });
            this.rActs.push(() => mapSet(cM, S.nm, p));
        }
        return (CDefs) => {
            let i = M;
            for (let C of CDefs)
                env[--i] = C;
        };
    }
    async Compile(elm, nodes) {
        for (let tag of this.setts.preformatted)
            this.setPRE.add(tag.toUpperCase());
        let t0 = now();
        this.bldr =
            (nodes
                ? await this.CChilds(elm, nodes)
                : await this.CElm(elm, T)) || dB;
        this.log(`Compiled ${this.srcNodeCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
    }
    log(msg) {
        if (this.setts.bTiming)
            console.log(new Date().toISOString().substring(11) + ` ${this.num}: ` + msg);
    }
    async Build(ar) {
        R = this;
        env = [];
        try {
            await this.bldr(ar);
        }
        finally {
            env = U;
        }
        await DoUpdate();
    }
    CChilds(srcParent, nodes = srcParent.childNodes) {
        let ES = this.SS();
        return this.CIter(nodes).finally(ES);
    }
    async CIter(iter) {
        let { rspc } = this, arr = Array.from(iter);
        while (rspc && arr.length && reWS.test(arr[arr.length - 1]?.nodeValue))
            arr.pop();
        let bldrs = await this.CArr(arr, this.rspc), l = bldrs.length;
        return !l ? N
            : l - 1 ? async function Iter(ar) {
                for (let b of bldrs)
                    await b(ar);
            }
                : bldrs[0];
    }
    async CArr(arr, rspc, i = 0) {
        let bldrs = [], L = arr.length, rv;
        while (i < L) {
            let srcN = arr[i++], bl;
            this.rspc = i == L && rspc;
            switch (srcN.nodeType) {
                case 1:
                    this.srcNodeCnt++;
                    bl = await this.CElm(srcN);
                    if (rv = bl?.auto)
                        try {
                            bldrs.push(bl);
                            var s = this.cRvars[rv], bs = await this.CArr(arr, rspc, this.cRvars[rv] = i), gv = this.CT.getLV(rv);
                            bl = bs.length && this.cRvars[rv]
                                ? async function Auto(ar) {
                                    let { r, sub, cr } = PrepRng(ar);
                                    if (cr) {
                                        let rvar = gv(), s = rvar._Subs.size;
                                        for (let b of bs)
                                            await b(sub);
                                        if (rvar._Subs.size == s)
                                            rvar.Subscribe(Subscriber(ar, Auto, r));
                                    }
                                    else if (r.upd != upd)
                                        for (let b of bs)
                                            await b(sub);
                                    r.upd = upd;
                                }
                                : (bldrs.push(...bs), N);
                            i = L;
                        }
                        finally {
                            this.cRvars[rv] = s;
                        }
                    break;
                case 3:
                    this.srcNodeCnt++;
                    let str = srcN.nodeValue, getText = this.CText(str), { fx } = getText;
                    if (fx !== Q) {
                        bl = async (ar) => PrepData(ar, getText());
                        if (this.ws < 4)
                            this.ws = / $/.test(str) ? 2 : 3;
                    }
                    break;
                case 8:
                    if (this.setts.bKeepComments) {
                        let getText = this.CText(srcN.nodeValue, 'Comment');
                        bl = async (ar) => PrepData(ar, getText(), T);
                    }
            }
            if (bl)
                bldrs.push(bl);
        }
        return bldrs;
    }
    async CElm(srcE, bUnhide) {
        try {
            let tag = srcE.tagName, atts = new Atts(srcE), CTL = this.rActs.length, glAtts = [], bf = [], af = [], bl, auto, constr = this.CT.getCS(tag), b, m, nm;
            for (let [att] of atts)
                if (m =
                    /^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(create|update|destroy|compile)+)$/
                        .exec(att))
                    if (m[1])
                        m[4] && tag != 'REACT'
                            || m[7] && tag == 'FOR'
                            || glAtts.push({
                                att,
                                m,
                                dV: m[5]
                                    ? this.CHandlr(att, atts.g(att))
                                    : m[8]
                                        ? this.CAttExp(atts, att)
                                        :
                                            this.CAttExpList(atts, att, T)
                            });
                    else {
                        let txt = atts.g(att);
                        if (m[10] == 'compile')
                            Ev(`(function(){${txt}\n})`).call(srcE);
                        else
                            (m[9] ? bf : af)
                                .push({
                                att,
                                txt,
                                C: /c/.test(att),
                                U: /u/.test(att),
                                D: /y/.test(att),
                                hndlr: m[9] && this.CHandlr(att, txt)
                            });
                    }
            if (bUnhide)
                atts.set('#hidden', 'false');
            if (constr)
                bl = await this.CInstance(srcE, atts, constr);
            else {
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            NoChilds(srcE);
                            let rv = atts.g('rvar'), t = '@value', twv = rv && atts.g(t), dGet = twv ? this.CExpr(twv, t) : this.CParam(atts, 'value'), bUpd = atts.gB('reacting') || atts.gB('updating') || twv, dSet = twv && this.CTarget(twv), dUpd = rv && this.CAttExp(atts, 'updates'), dSto = rv && this.CAttExp(atts, 'store'), dSNm = dSto && this.CParam(atts, 'storename'), vLet = this.LVar(rv || atts.g('let') || atts.g('var', T)), vGet = rv && this.CT.getLV(rv), onMod = rv && this.CParam(atts, 'onmodified');
                            auto = rv && atts.gB('auto', this.setts.bAutoSubscribe) && !onMod && rv;
                            bl = async function DEF(ar, re) {
                                let r = ar.r, v, upd;
                                if (!r || bUpd || re) {
                                    try {
                                        ro = T;
                                        v = dGet?.();
                                    }
                                    finally {
                                        ro = F;
                                    }
                                    if (rv)
                                        if (r)
                                            vGet().Set(v);
                                        else
                                            vLet(RVAR(N, v, dSto?.(), dSet?.(), dSNm?.() || rv))
                                                .Subscribe((upd = dUpd?.()) && (() => upd.SetDirty()))
                                                .Subscribe(onMod?.());
                                    else
                                        vLet(v);
                                }
                            };
                        }
                        break;
                    case 'IF':
                    case 'CASE':
                        bl = await this.CCase(srcE, atts);
                        break;
                    case 'FOR':
                        bl = await this.CFor(srcE, atts);
                        break;
                    case 'MODULE':
                        atts.g('id');
                        break;
                    case 'INCLUDE':
                        let src = atts.g('src', T);
                        bl = await (srcE.children.length || srcE.textContent.trim()
                            ? this.CChilds(srcE)
                            : this.Framed(async (SS) => {
                                let C = new RComp(this, this.GetPath(src), { bSubfile: T }), task = C.Compile(N, await this.fetchModule(src))
                                    .catch(e => { alert(e); throw e; });
                                return async function INCLUDE(ar) {
                                    await NoTime(task);
                                    let { sub, ES } = SS(ar);
                                    await C.bldr(sub).finally(ES);
                                };
                            }));
                        break;
                    case 'IMPORT':
                        {
                            let src = atts.g('src', T), bIncl = atts.gB('include'), bAsync = atts.gB('async'), lvars = this.LVars(atts.g('defines')), imps = Array.from(mapI(srcE.children, ch => this.CSignat(ch))), DC = this.LCons(imps), cTask = OMods.get(src);
                            if (!cTask) {
                                let C = new RComp(this, this.GetPath(src), { bSubfile: T }, new Context());
                                C.log(src);
                                OMods.set(src, cTask = C.CIter(await this.fetchModule(src))
                                    .then(b => [b, C.CT], e => { alert(e); throw e; }));
                            }
                            let task = cTask.then(([b, CT]) => {
                                for (let sig of imps) {
                                    let { S, dC } = CT.getCS(sig.nm)
                                        || thro(`<${sig.nm}> is missing in '${src}'`);
                                    bAsync
                                        ? !sig.IsCompat(S) && thro(`Import signature ${sig.srcE.outerHTML} is incompatible with module signature ${S.srcE.outerHTML}`)
                                        : ass(sig, S);
                                    sig.g = dC;
                                }
                                for (let lv of lvars)
                                    lv.g = CT.getLV(lv.nm);
                                return b;
                            });
                            if (!bAsync) {
                                for (let sig of imps)
                                    sig.task = task;
                            }
                            bl = async function IMPORT(ar) {
                                let { sub, cr, r } = PrepRng(ar, srcE);
                                if (cr || bIncl) {
                                    try {
                                        var b = await NoTime(task), s = env, MEnv = env = r.val || (r.val = []);
                                        await b(bIncl ? sub : { parN: D.createDocumentFragment() });
                                    }
                                    finally {
                                        env = s;
                                    }
                                    DC(mapI(imps, S => S.g(MEnv)));
                                    for (let lv of lvars)
                                        lv(lv.g(MEnv));
                                }
                            };
                        }
                        break;
                    case 'REACT':
                        bl = await this.CChilds(srcE);
                        break;
                    case 'RHTML':
                        {
                            NoChilds(srcE);
                            let dSrc = this.CParam(atts, 'srctext', T), mods = this.CAtts(atts), C = new RComp(N, this.FilePath, { bSubfile: T, bTiming: this.setts.bTiming }), { ws, rspc } = this;
                            this.ws = 1;
                            bl = async function RHTML(ar) {
                                let src = dSrc(), { r, cr } = PrepElm(ar, 'rhtml-rhtml'), { node } = r;
                                ApplyMods(node, mods, cr);
                                if (src != r.res) {
                                    r.res = src;
                                    let s = env, sRoot = C.head = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = D.createElement('rhtml'), sAr = {
                                        parN: sRoot,
                                        parR: r.ch || (r.ch = new Range(N, N, 'Shadow'))
                                    };
                                    r.ch.erase(sRoot);
                                    sRoot.innerHTML = Q;
                                    try {
                                        tempElm.innerHTML = src;
                                        await ass(C, { ws, rspc, CT: new Context() }).Compile(tempElm, tempElm.childNodes);
                                        await C.Build(sAr);
                                    }
                                    catch (e) {
                                        sRoot.appendChild(createErrNode(`Compile error: ` + e));
                                    }
                                    finally {
                                        env = s;
                                    }
                                }
                                parN = ar.parN;
                            };
                        }
                        break;
                    case 'SCRIPT':
                        bl = await this.CScript(srcE, atts);
                        break;
                    case 'STYLE':
                        this.head.appendChild(srcE);
                        break;
                    case 'COMPONENT':
                        bl = await this.CComponent(srcE, atts);
                        break;
                    case 'DOCUMENT':
                        let vDoc = this.LVar(atts.g('name', T)), bEncaps = atts.gB('encapsulate'), RC = new RComp(this), vParams = RC.LVars(atts.g('params')), vWin = RC.LVar(atts.g('window')), docBldr = ((RC.head = D.createDocumentFragment()), await RC.CChilds(srcE));
                        bl = async function DOCUMENT(ar) {
                            if (!ar.r) {
                                let doc = ar.parN.ownerDocument, docEnv = env, wins = new Set();
                                vDoc({
                                    async render(w, cr, args) {
                                        let s = env, d = w.document;
                                        env = docEnv;
                                        SetLVars(vParams, args);
                                        vWin(w);
                                        try {
                                            if (cr) {
                                                if (!bEncaps)
                                                    copySSheets(doc, d);
                                                for (let S of RC.head.childNodes)
                                                    d.head.append(S.cloneNode(T));
                                            }
                                            let ar = { parN: d.body, r: w.r };
                                            await docBldr(ar);
                                        }
                                        finally {
                                            env = s;
                                        }
                                    },
                                    open(target, features, ...args) {
                                        let w = W.open(Q, target || Q, features), cr = !chiWins.has(w);
                                        if (cr) {
                                            w.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                this.close(); });
                                            w.addEventListener('close', () => chiWins.delete(w), wins.delete(w));
                                            chiWins.add(w);
                                            wins.add(w);
                                        }
                                        else
                                            w.document.body.innerHTML = Q;
                                        this.render(w, cr, args);
                                        return w;
                                    },
                                    async print(...args) {
                                        let iframe = doc.createElement('iframe');
                                        iframe.hidden = T;
                                        doc.body.appendChild(iframe);
                                        await this.render(iframe.contentWindow, T, args);
                                        iframe.contentWindow.print();
                                        iframe.remove();
                                    },
                                    closeAll: () => {
                                        for (let w of wins)
                                            w.close();
                                    }
                                });
                            }
                        };
                        break;
                    case 'RHEAD':
                        let { ws } = this;
                        this.ws = this.rspc = 1;
                        b = await this.CChilds(srcE);
                        this.ws = ws;
                        bl = b && async function HEAD(ar) {
                            let { sub } = PrepRng(ar, srcE);
                            sub.parN = ar.parN.ownerDocument.head;
                            sub.bfor = N;
                            await b(sub);
                            if (sub.prvR)
                                sub.prvR.parN = sub.parN;
                        };
                        break;
                    case 'RSTYLE':
                        let s = [this.setts.bDollarRequired, this.rIS, this.ws];
                        try {
                            this.setts.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = 4;
                            b = await this.CChilds(srcE);
                            bl = b && async function RSTYLE(ar) {
                                await b(PrepElm(ar, 'STYLE').chAr);
                                parN = ar.parN;
                            };
                        }
                        finally {
                            [this.setts.bDollarRequired, this.rIS, this.ws] = s;
                        }
                        break;
                    case 'ELEMENT':
                        bl = await this.CHTMLElm(srcE, atts, this.CParam(atts, 'tagname', T));
                        this.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dNm = this.CParam(atts, 'name', T), dVal = this.CParam(atts, 'value', T);
                        bl = async function ATTRIB(ar) {
                            let r = PrepRng(ar, srcE).r, nm = dNm(), p = ar.parN;
                            if (r.val && nm != r.val)
                                p.removeAttribute(r.val);
                            if (r.val = nm)
                                p.setAttribute(nm, dVal());
                        };
                        break;
                    default:
                        bl = await this.CHTMLElm(srcE, atts);
                }
                if (!bUnhide)
                    atts.NoneLeft();
            }
            nm = (bl || (bl = dB)).name;
            if (bf.length + af.length) {
                for (let g of af)
                    g.hndlr = this.CHandlr(g.att, g.txt);
                let b = bl;
                bl = async function Pseudo(ar, re) {
                    let { r, prvR } = ar, bfD;
                    for (let g of bf) {
                        if (g.D)
                            bfD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(r?.node || ar.parN);
                    }
                    await b(ar, re);
                    let prev = (r ? ar.r != r && r
                        : ar.prvR != prvR && ar.prvR) || PrepRng(ar).r;
                    prev.bfD = bfD;
                    for (let g of af) {
                        if (g.D)
                            prev.afD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(prev.node || ar.parN);
                    }
                };
            }
            for (let { att, m, dV } of this.setts.version ? glAtts : glAtts.reverse()) {
                let b = bl, rre = m[3] ? 2 : 1, es = m[6] ? 'e' : 's';
                bl =
                    m[2]
                        ? async function REACT(ar, re) {
                            let { r, sub } = PrepRng(ar, srcE, att);
                            if (r.upd != upd)
                                await b(sub, re);
                            r.upd = upd;
                            if (!re) {
                                let subs = r.subs || (r.subs = Subscriber(ar, REACT, r, rre)), pVars = r.rvars, i = 0;
                                for (let rvar of r.rvars = dV()) {
                                    if (pVars) {
                                        let p = pVars[i++];
                                        if (rvar == p)
                                            continue;
                                        p._Subs.delete(subs);
                                    }
                                    try {
                                        rvar.Subscribe(subs);
                                    }
                                    catch {
                                        ErrAtt('This is not an RVAR', att);
                                    }
                                }
                            }
                        }
                        : m[5]
                            ? async function SetOnES(ar, re) {
                                let s = on;
                                on = { ...on };
                                try {
                                    on[es] = dV();
                                    await b(ar, re);
                                }
                                finally {
                                    on = s;
                                }
                            }
                            : m[7]
                                ? async function HASH(ar, re) {
                                    let { sub, r, cr } = PrepRng(ar, srcE, 'hash'), hashes = dV();
                                    if (cr || hashes.some((hash, i) => hash !== r.val[i])) {
                                        r.val = hashes;
                                        await b(sub, re);
                                    }
                                }
                                : m[8]
                                    ? function hIf(ar) {
                                        let c = dV(), { sub } = PrepRng(ar, srcE, att, 1, !c);
                                        if (c)
                                            return b(sub);
                                    }
                                    :
                                        function renew(sub) {
                                            return b(PrepRng(sub, srcE, 'renew', 2).sub);
                                        };
            }
            return bl != dB && ass(this.rActs.length == CTL
                ? this.ErrH(bl, srcE)
                : function Elm(ar) {
                    return bl(ar).catch(e => { throw ErrMsg(srcE, e, 39); });
                }, { auto, nm });
        }
        catch (e) {
            throw ErrMsg(srcE, e);
        }
    }
    ErrH(b, srcN) {
        return b && (async (ar) => {
            let r = ar.r;
            if (r?.errN) {
                ar.parN.removeChild(r.errN);
                r.errN = U;
            }
            try {
                await b(ar);
            }
            catch (e) {
                let msg = srcN instanceof HTMLElement ? ErrMsg(srcN, e, 39) : e;
                if (this.setts.bAbortOnError)
                    throw msg;
                this.log(msg);
                if (on.e)
                    on.e(e);
                else if (this.setts.bShowErrors) {
                    let errN = ar.parN.insertBefore(createErrNode(msg), ar.r?.FstOrNxt);
                    if (r)
                        r.errN = errN;
                }
            }
        });
    }
    async CScript(srcE, atts) {
        let { type, text, defer, async } = srcE, src = atts.g('src'), defs = atts.g('defines'), varlist = [...split(defs)], bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), bUpd = atts.gB('updating'), { ct } = this.CT, lvars = mOto && mOto[2] && this.LVars(defs), exp, SetVars = lvars
            ? (e) => SetLVars(lvars, e)
            : (e) => varlist.forEach((nm, i) => G[nm] = e[i]);
        atts.clear();
        if (mOto || (bCls || bMod) && this.setts.bSubfile) {
            if (mOto?.[3]) {
                let prom = (async () => Ev(US +
                    `(function([${ct}]){{${src ? await this.FetchText(src) : text}\nreturn[${defs}]}})`))();
                return async function LSCRIPT(ar) {
                    if (!ar.r || bUpd)
                        SetVars((await prom)(env));
                };
            }
            else if (bMod) {
                let prom = src
                    ? import(this.GetURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => p1 + this.GetURL(p2) + p3)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src));
                return async function MSCRIPT(ar) {
                    !ar.r &&
                        SetVars(await prom.then(obj => varlist.map(nm => nm in obj ? obj[nm] : thro(`'${nm}' is not exported by this script`))));
                };
            }
            else {
                let prom = (async () => `${mOto ? US : Q}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    prom = prom.then(txt => void (exp = Ev(txt)));
                else if (!mOto && !defer)
                    exp = Ev(await prom);
                return async function SCRIPT(ar) {
                    !ar.r &&
                        SetVars(exp || (exp = Ev(await prom)));
                };
            }
        }
    }
    async CCase(srcE, atts) {
        let bHiding = atts.gB('hiding'), dVal = this.CAttExp(atts, 'value'), caseNodes = [], body = [];
        for (let node of srcE.childNodes) {
            if (node instanceof HTMLElement)
                switch (node.tagName) {
                    case 'THEN':
                        var bThen = T;
                        new Atts(node).NoneLeft();
                        caseNodes.push({ node, atts });
                        continue;
                    case 'ELSE':
                    case 'WHEN':
                        caseNodes.push({ node, atts: new Atts(node) });
                        continue;
                }
            body.push(node);
        }
        if (!bThen)
            if (srcE.tagName == 'IF')
                caseNodes.unshift({ node: srcE, atts, body });
            else
                atts.NoneLeft();
        let caseList = [], { ws, rspc, CT } = this, postCT = CT, postWs = 0, bE;
        for (let { node, atts, body } of caseNodes) {
            let ES = ass(this, { ws, rspc, CT: new Context(CT) })
                .SS();
            try {
                let cond, not = F, patt, p;
                switch (node.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp(atts, 'cond');
                        not = atts.gB('not');
                        patt = dVal && ((p = atts.g('match')) != N
                            ? this.CPatt(p)
                            : (p = atts.g('urlmatch')) != N
                                ? this.CPatt(p, T)
                                : (p = atts.g('regmatch')) != N
                                    ? { regex: new RegExp(p, 'i'),
                                        lvars: this.LVars(atts.g('captures'))
                                    }
                                    : N);
                        if (patt?.lvars.length && (bHiding || not))
                            throw `Pattern capturing can't be combined with 'hiding' or 'not'`;
                    case 'ELSE':
                        caseList.push({
                            cond, not, patt,
                            b: this.ErrH(await this.CChilds(node, body) || dB, node),
                            node
                        });
                        atts.NoneLeft();
                        postWs = Math.max(postWs, this.ws);
                        postCT = postCT.max(this.CT);
                        bE || (bE = cond === U);
                }
            }
            catch (e) {
                throw node.tagName == 'IF' ? e : ErrMsg(node, e);
            }
            finally {
                ES();
            }
        }
        this.ws = !bE && ws > postWs ? ws : postWs;
        this.CT = postCT;
        return caseList.length && async function CASE(ar) {
            let val = dVal?.(), RRE, cAlt;
            try {
                for (var alt of caseList)
                    if (!((!alt.cond || alt.cond())
                        && (!alt.patt || val != N && (RRE = alt.patt.regex.exec(val)))) == alt.not) {
                        cAlt = alt;
                        break;
                    }
            }
            catch (e) {
                throw alt.node.tagName == 'IF' ? e : ErrMsg(alt.node, e);
            }
            finally {
                if (bHiding) {
                    for (let alt of caseList) {
                        let { r, chAr, cr } = PrepElm(ar, 'WHEN');
                        if (!(r.node.hidden = alt != cAlt) && !ar.bR
                            || cr)
                            await alt.b(chAr);
                    }
                    parN = ar.parN;
                }
                else {
                    let { sub, cr } = PrepRng(ar, srcE, Q, 1, cAlt);
                    if (cAlt && (cr || !ar.bR)) {
                        if (RRE)
                            RRE.shift(),
                                SetLVars(cAlt.patt.lvars, cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE);
                        await cAlt.b(sub);
                    }
                }
            }
        };
    }
    CFor(srcE, atts) {
        let letNm = atts.g('let') ?? atts.g('var'), ixNm = atts.g('index', U, U, T);
        this.rspc = F;
        if (letNm != N) {
            let dOf = this.CAttExp(atts, 'of', T), pvNm = atts.g('previous', U, U, T), nxNm = atts.g('next', U, U, T), dUpd = this.CAttExp(atts, 'updates'), bRe = atts.gB('reacting') || atts.gB('reactive') || dUpd;
            return this.Framed(async (SS) => {
                let vLet = this.LVar(letNm), vIx = this.LVar(ixNm), vPv = this.LVar(pvNm), vNx = this.LVar(nxNm), dKey = this.CAttExp(atts, 'key'), dHash = this.CAttExpList(atts, 'hash'), b = await this.CIter(srcE.childNodes);
                return b && async function FOR(ar) {
                    let { r, sub } = PrepRng(ar, srcE, Q), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Nxt, iter = dOf() || E, pIter = async (iter) => {
                        if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                            throw `[of] Value (${iter}) is not iterable`;
                        let keyMap = r.val || (r.val = new Map()), nwMap = new Map(), ix = 0, { ES } = SS(N, {});
                        try {
                            for await (let item of iter) {
                                vLet(item);
                                vIx(ix);
                                let hash = dHash?.(), key = dKey?.() ?? hash?.[0];
                                if (key != N && nwMap.has(key))
                                    throw `Duplicate key '${key}'`;
                                nwMap.set(key ?? {}, { item, hash, ix: ix++ });
                            }
                        }
                        finally {
                            ES();
                        }
                        let nxChR = r.ch, iterator = nwMap.entries(), nxIter = nxNm && nwMap.values(), prItem, nxItem, prvR, chAr;
                        sub.parR = r;
                        nxIter?.next();
                        while (T) {
                            let k, nx = iterator.next();
                            while (nxChR && !nwMap.has(k = nxChR.key)) {
                                if (k != N)
                                    keyMap.delete(k);
                                nxChR.erase(parN);
                                if (nxChR.subs)
                                    nxChR.rvars[0]._Subs.delete(nxChR.subs);
                                nxChR.prev = N;
                                nxChR = nxChR.nx;
                            }
                            if (nx.done)
                                break;
                            let [key, { item, hash, ix }] = nx.value, chR = keyMap.get(key), cr = !chR;
                            if (nxIter)
                                nxItem = nxIter.next().value?.item;
                            if (cr) {
                                sub.r = N;
                                sub.prvR = prvR;
                                sub.bfor = nxChR?.FstOrNxt || bfor;
                                ({ r: chR, sub: chAr } = PrepRng(sub, N, `${letNm}(${ix})`));
                                if (key != N)
                                    keyMap.set(key, chR);
                                chR.key = key;
                            }
                            else {
                                if (chR.fragm) {
                                    parN.insertBefore(chR.fragm, nxChR?.FstOrNxt || bfor);
                                    chR.fragm = N;
                                }
                                else
                                    while (T) {
                                        if (nxChR == chR)
                                            nxChR = nxChR.nx;
                                        else {
                                            if (nwMap.get(nxChR.key)?.ix > ix + 3) {
                                                (nxChR.fragm = D.createDocumentFragment()).append(...nxChR.Nodes());
                                                nxChR = nxChR.nx;
                                                continue;
                                            }
                                            chR.prev.nx = chR.nx;
                                            if (chR.nx)
                                                chR.nx.prev = chR.prev;
                                            let nxNode = nxChR?.FstOrNxt || bfor;
                                            for (let node of chR.Nodes())
                                                parN.insertBefore(node, nxNode);
                                        }
                                        break;
                                    }
                                chR.nx = nxChR;
                                chR.text = `${letNm}(${ix})`;
                                if (prvR)
                                    prvR.nx = chR;
                                else
                                    r.ch = chR;
                                sub.r = chR;
                                chAr = PrepRng(sub).sub;
                                sub.parR = N;
                            }
                            chR.prev = prvR;
                            prvR = chR;
                            if (cr ||
                                !hash || hash.some((h, i) => h != chR.hash[i])) {
                                chR.hash = hash;
                                let { sub, ES } = SS(chAr, chR);
                                try {
                                    if (bRe && (cr || item != chR.rvars[0])) {
                                        RVAR_Light(item, dUpd && [dUpd()]);
                                        if (chR.subs)
                                            item._Subs = chR.rvars[0]._Subs;
                                        chR.rvars = [item];
                                    }
                                    vLet(item);
                                    vIx(ix);
                                    vPv(prItem);
                                    vNx(nxItem);
                                    await b(sub);
                                    if (bRe && !chR.subs)
                                        item.Subscribe(chR.subs = Subscriber(sub, b, chR.ch));
                                }
                                finally {
                                    ES();
                                }
                            }
                            prItem = item;
                        }
                        if (prvR)
                            prvR.nx = N;
                        else
                            r.ch = N;
                    };
                    if (iter instanceof Promise) {
                        let subEnv = { env, on };
                        r.rvars = [
                            RVAR(N, iter)
                                .Subscribe(r.subs =
                                ass(iter => (({ env, on } = subEnv),
                                    pIter(iter)), { sAr: T }))
                        ];
                    }
                    else
                        await pIter(iter);
                };
            });
        }
        else {
            let nm = atts.g('of', T, T).toUpperCase(), { S, dC } = this.CT.getCS(nm) ||
                thro(`Missing attribute [let]`);
            return this.Framed(async (SS) => {
                let vIx = this.LVar(ixNm), DC = this.LCons([S]), b = await this.CChilds(srcE);
                return b && async function FOREACH_Slot(ar) {
                    let { tmplts, env } = dC(), { ES, sub } = SS(ar), i = 0;
                    try {
                        for (let slotBldr of tmplts) {
                            vIx(i++);
                            DC([
                                { nm, tmplts: [slotBldr], env }
                            ]);
                            await b(sub);
                        }
                    }
                    finally {
                        ES();
                    }
                };
            });
        }
    }
    CSignat(eSignat) {
        let S = new Signat(eSignat), s;
        for (let attr of eSignat.attributes) {
            if (S.RP)
                throw `Rest parameter must be last`;
            let [, mode, rp, nm, opt] = /^(#|@|(\.\.\.)|_|)(.*?)(\?)?$/.exec(attr.name);
            if (mode != '_')
                S.Params.push({ mode, nm,
                    pDf: rp
                        ? () => E
                        : attr.value != Q
                            ? mode ? this.CExpr(attr.value, attr.name) : this.CText(attr.value, attr.name)
                            : opt && (/^on/.test(nm) ? _ => dU : dU)
                });
            S.RP = rp && nm;
        }
        for (let eSlot of eSignat.children) {
            mapNm(S.Slots, s = this.CSignat(eSlot));
            if (/^CONTENT/.test(s.nm)) {
                if (S.CSlot)
                    throw 'Multiple content slots';
                S.CSlot = s;
            }
        }
        return S;
    }
    async CComponent(srcE, atts) {
        let bRec = atts.gB('recursive'), { head, ws } = this, signats = [], CDefs = [], encaps = atts.gB('encapsulate')
            && (this.head = srcE.ownerDocument.createDocumentFragment()).children, arr = Array.from(srcE.children), elmSign = arr.shift() || thro('Missing signature(s)'), eTmpl = arr.pop(), t = /^TEMPLATE(S)?$/.exec(eTmpl?.tagName) || thro('Missing template(s)');
        for (let elm of /^SIGNATURES?$/.test(elmSign.tagName) ? elmSign.children : [elmSign])
            signats.push(this.CSignat(elm));
        try {
            var DC = bRec && this.LCons(signats), ES = this.SS(), b = this.ErrH(await this.CIter(arr), srcE), mapS = new Map(mapI(signats, S => [S.nm, S]));
            for (let [nm, elm, body] of t[1]
                ? mapI(eTmpl.children, elm => [elm.tagName, elm, elm])
                : [
                    [signats[0].nm, eTmpl, eTmpl.content]
                ]) {
                CDefs.push({
                    nm,
                    tmplts: [await this.CTempl(mapS.get(nm) || thro(`Template <${nm}> has no signature`), elm, F, U, body, encaps)]
                });
                mapS.delete(nm);
            }
            for (let [nm] of mapS)
                throw `Signature <${nm}> has no template`;
        }
        finally {
            ES();
            ass(this, { head, ws });
        }
        DC || (DC = this.LCons(signats));
        return async function COMP(ar) {
            DC(CDefs.map(C => ({ ...C, env })));
            await b?.(ar);
        };
    }
    CTempl(S, srcE, bIsSlot, atts, body = srcE, styles) {
        return this.Framed(async (SS) => {
            this.ws = this.rspc = 1;
            let myAtts = atts || new Atts(srcE), lvars = S.Params.map(({ mode, nm }) => {
                let lnm = myAtts.g(nm) ?? myAtts.g(mode + nm);
                return [nm, this.LVar(lnm || (lnm === Q || !bIsSlot ? nm : N))];
            }), DC = (!atts && myAtts.NoneLeft(),
                this.LCons(S.Slots.values())), b = await this.CIter(body.childNodes), tag = /^[A-Z].*-/.test(S.nm) ? S.nm : `rhtml-${S.nm}`;
            return b && async function TEMPL(args, mSlots, env, ar) {
                let { sub, ES } = SS(ar);
                lvars.forEach(([nm, lv], i) => {
                    let arg = args[nm];
                    lv(arg !== U ? arg : S.Params[i]?.pDf?.());
                });
                DC(mapI(S.Slots.keys(), nm => ({ nm,
                    tmplts: mSlots.get(nm) || E,
                    env
                })));
                if (styles) {
                    let { r: { node }, chAr, cr } = PrepElm(sub, tag), shadow = node.shadowRoot || node.attachShadow({ mode: 'open' });
                    if (cr)
                        for (let style of styles)
                            shadow.appendChild(style.cloneNode(T));
                    if (S.RP)
                        ApplyMod(node, { mt: 8, nm: N, depV: N }, args[S.RP], cr);
                    chAr.parN = shadow;
                    sub = chAr;
                }
                await b(sub).finally(ES);
                parN = ar.parN;
            };
        }).catch(e => { throw ErrMsg(srcE, `<${S.nm}> template: ` + e); });
    }
    async CInstance(srcE, atts, { S, dC }) {
        await S.task;
        let { RP, CSlot } = S, slotE, slot, nm, s, gArgs = S.Params.map(({ mode, nm, pDf }) => [nm, ...(nm == RP
                ? E
                : mode == '@'
                    ? (s = atts.g(mode + nm),
                        [this.CExpr(s, mode + nm), this.CTarget(s)])
                    : [this.CParam(atts, nm, !pDf)])
        ]), SBldrs = new Map(mapI(S.Slots, ([nm]) => [nm, []]));
        for (let node of Array.from(srcE.children))
            if ((slot = S.Slots.get(nm = (slotE = node).tagName))
                && slot != CSlot) {
                SBldrs.get(nm).push(await this.CTempl(slot, slotE, T));
                srcE.removeChild(node);
            }
        if (CSlot)
            SBldrs.get(CSlot.nm).push(await this.CTempl(CSlot, srcE, T, atts));
        if (RP) {
            let mods = this.CAtts(atts);
            gArgs[gArgs.length - 1][1] =
                () => mods.map((M) => ({ M, v: M.depV() }));
        }
        atts.NoneLeft();
        this.ws = 3;
        return async function INST(ar) {
            let { r, sub, cr } = PrepRng(ar, srcE), sEnv = env, cdef = dC(), args = r.val || (r.val = {});
            if (cdef) {
                ro = T;
                try {
                    for (let [nm, dG, dS] of gArgs) {
                        let v = dG?.();
                        if (dS && !cr)
                            args[nm].V = v;
                        else
                            args[nm] = dS ? RVAR(Q, v, N, dS()) : v;
                    }
                }
                finally {
                    ro = F;
                }
                try {
                    env = cdef.env;
                    for (let tmpl of cdef.tmplts)
                        await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {
                    env = sEnv;
                }
            }
        };
    }
    async CHTMLElm(srcE, atts, dTag) {
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, Q), preWs = this.ws, postWs;
        if (this.setPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
            this.ws = 4;
            postWs = 1;
        }
        else if (reBlock.test(nm))
            this.ws = this.rspc = postWs = 1;
        else if (reInline.test(nm)) {
            this.ws = this.rspc = 1;
            postWs = 3;
        }
        if (preWs == 4)
            postWs = preWs;
        let mods = this.CAtts(atts), childBldr = await this.CChilds(srcE);
        if (postWs)
            this.ws = postWs;
        if (nm == 'A' && this.setts.bAutoReroute && !mods.some(M => M.nm == 'onclick'))
            mods.push({ mt: 1, nm: 'onclick', depV: () => parN.onclick || (parN.href.indexOf(L.origin + DL.basepath) == 0 ? reroute : N) });
        return async function ELM(ar, re) {
            let { r: { node }, chAr, cr } = PrepElm(ar, nm || dTag(), ar.srcN);
            if (re != 2)
                await childBldr?.(chAr);
            if (node.className)
                node.className = Q;
            if (node.hndlrs) {
                for (let { evType, listener } of node.hndlrs)
                    node.removeEventListener(evType, listener);
                node.hndlrs.length = 0;
            }
            ApplyMods(node, mods, cr);
            parN = ar.parN;
        };
    }
    CAtts(atts) {
        let mods = [], m;
        function addM(mt, nm, depV) {
            mods.push({ mt, nm, depV });
        }
        for (let [nm, V] of atts)
            if (m = /(.*?)\.+$/.exec(nm))
                addM(0, nm, this.CText(V, nm));
            else if (m = /^on(.*?)\.*$/i.exec(nm))
                addM(5, m[0], this.AddErrH(this.CHandlr(nm, V)));
            else if (m = /^#class[:.](.*)$/.exec(nm))
                addM(3, m[1], this.CExpr(V, nm));
            else if (m = /^(#)?style\.(.*)$/.exec(nm))
                addM(4, m[2], m[1] ? this.CExpr(V, nm) : this.CText(V, nm));
            else if (nm == '+style')
                addM(6, nm, this.CExpr(V, nm));
            else if (nm == "+class")
                addM(7, nm, this.CExpr(V, nm));
            else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) {
                let p = m[1], nm = altProps[m[2]] || m[2], dSet;
                if (/[@#]/.test(p)) {
                    let dV = this.CExpr(V, nm);
                    if (/^on/.test(nm))
                        addM(5, nm, this.AddErrH(dV));
                    else
                        addM(1, nm, dV);
                }
                if (p != '#') {
                    let dS = this.CTarget(V), cnm;
                    dSet = () => {
                        let S = dS();
                        return nm ? function () {
                            S(this[cnm || (cnm = ChkNm(this, nm))]);
                        }
                            : function () {
                                S(this);
                            };
                    };
                    if (/\*/.test(p))
                        addM(9, nm, dSet);
                    if (/\+/.test(p))
                        addM(10, nm, dSet);
                    if (/[@!]/.test(p))
                        addM(5, /!!|@@/.test(p) ? 'onchange' : 'oninput', dSet);
                }
            }
            else if (m = /^\.\.\.(.*)/.exec(nm)) {
                if (V)
                    throw 'A rest parameter cannot have a value';
                addM(8, nm, this.CT.getLV(m[1]));
            }
            else if (nm == 'src')
                addM(2, this.FilePath, this.CText(V, nm));
            else
                addM(0, nm, this.CText(V, nm));
        atts.clear();
        return mods;
    }
    CText(text, nm) {
        let f = (re) => `(?:\\{(?:\\{${re}\\}|[^])*?\\}\
|'(?:\\\\.|[^])*?'\
|"(?:\\\\.|[^])*?"\
|\`(?:\\\\[^]|\\\$\\{${re}}|[^])*?\`\
|/(?:\\\\.|[^])*?\
|[^])*?`, rIS = this.rIS || (this.rIS = new RegExp(`\\\\([{}])|\\$${this.setts.bDollarRequired ? Q : '?'}\\{(${f(f(f('[^]*?')))})\\}|$`, 'g')), gens = [], ws = nm || this.setts.bKeepWhiteSpace ? 4 : this.ws, fx = Q, iT = T;
        rIS.lastIndex = 0;
        while (T) {
            let lastIx = rIS.lastIndex, m = rIS.exec(text);
            fx += text.slice(lastIx, m.index) + (m[1] || Q);
            if (!m[0] || m[2]?.trim()) {
                if (ws < 4) {
                    fx = fx.replace(/[ \t\n\r]+/g, " ");
                    if (ws <= 2 && !gens.length)
                        fx = fx.replace(/^ /, Q);
                    if (this.rspc && !m[0])
                        fx = fx.replace(/ $/, Q);
                }
                if (fx)
                    gens.push(fx);
                if (!m[0])
                    return iT ? ass(() => fx, { fx })
                        : () => {
                            let s = Q;
                            for (let g of gens)
                                s += typeof g == 'string' ? g : g() ?? Q;
                            return s;
                        };
                gens.push(this.CExpr(m[2], nm, U, '{}'));
                iT = fx = Q;
            }
        }
    }
    CPatt(patt, url) {
        let reg = Q, lvars = [], regIS = /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\[^])|\[\^?(?:\\[^]|[^\\\]])*\]|$/g;
        while (regIS.lastIndex < patt.length) {
            let ix = regIS.lastIndex, m = regIS.exec(patt), lits = patt.slice(ix, m.index);
            reg +=
                lits.replace(/\W/g, s => '\\' + s)
                    + (m[1] != N
                        ? (lvars.push(this.LVar(m[1])), '(.*?)')
                        : m[0] == '?' ? '.'
                            : m[0] == '*' ? '.*'
                                : m[2] ? m[2]
                                    : m[0]);
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CParam(atts, att, bReq) {
        let txt = atts.g(att);
        return (txt == N ? this.CAttExp(atts, att, bReq)
            : /^on/.test(att) ? this.CHandlr(att, txt)
                : this.CText(txt, att));
    }
    CAttExp(atts, att, bReq) {
        return this.CExpr(atts.g(att, bReq, T), att, U);
    }
    CTarget(expr) {
        return this.Closure(`return $=>(${expr})=$`, ` in assigment target "${expr}"`);
    }
    CHandlr(nm, text) {
        return /^#/.test(nm) ? this.CExpr(text, nm)
            : this.CExpr(`function(event){${text}\n}`, nm, text);
    }
    CExpr(expr, nm, src = expr, dlms = '""') {
        return (expr == N ? expr
            : this.Closure(`return(${expr}\n)`, '\nat ' + (nm ? `[${nm}]=` : Q) + dlms[0] + Abbr(src) + dlms[1]));
    }
    CAttExpList(atts, attNm, bReacts) {
        let list = atts.g(attNm, F, T);
        if (list == N)
            return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars[nm] = N;
        return this.CExpr(`[${list}\n]`, attNm);
    }
    Closure(body, E = Q) {
        let { ct, lvMap: varM, d } = this.CT, n = d + 1;
        for (let m of body.matchAll(/\b[A-Z_$][A-Z0-9_$]*\b/gi)) {
            let k = varM.get(m[0]);
            if (k?.[0] < n)
                n = k[0];
        }
        if (n > d)
            ct = Q;
        else {
            let p0 = d - n, p1 = p0;
            while (n--)
                p1 = ct.indexOf(']', p1) + 1;
            ct = `[${ct.slice(0, p0)}${ct.slice(p1)}]`;
        }
        try {
            var f = Ev(US +
                `(function(${ct}){${body}})`);
            return () => {
                try {
                    return f.call(parN, env);
                }
                catch (e) {
                    throw e + E;
                }
            };
        }
        catch (e) {
            throw e + E;
        }
    }
    AddErrH(dHndlr) {
        return () => {
            let hndlr = dHndlr(), { e, s } = on;
            return (hndlr && (e || s)
                ? (ev) => {
                    try {
                        let a = hndlr.call(ev.target, ev);
                        return (a instanceof Promise
                            ? a.then(v => (s?.(ev), v), e)
                            : s?.(ev), a);
                    }
                    catch (er) {
                        (e || thro)(er);
                    }
                }
                : hndlr);
        };
    }
    GetURL(src) {
        return new URL(src, this.FilePath).href;
    }
    GetPath(src) {
        return this.GetURL(src).replace(/[^/]*$/, Q);
    }
    FetchText(src) {
        return RFetch(this.GetURL(src), { headers: this.setts.headers }).then(r => r.text());
    }
    async fetchModule(src) {
        let m = D.getElementById(src);
        if (!m) {
            let { head, body } = P.parseFromString(await this.FetchText(src), 'text/html'), e = body.firstElementChild;
            if (e?.tagName != 'MODULE')
                return concI(head.childNodes, body.childNodes);
            m = e;
        }
        else if (m.tagName != 'MODULE')
            throw `'${src}' must be a <MODULE>`;
        return m.childNodes;
    }
}
RComp.iNum = 0;
class Atts extends Map {
    constructor(elm) {
        super();
        for (let a of elm.attributes)
            if (!/^_/.test(a.name))
                super.set(a.name, a.value);
    }
    g(nm, bReq, bHash, bI) {
        let m = nm, v = super.get(m);
        if (v == N && bHash)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute [${nm}]`;
        return bI && v == Q ? nm : v;
    }
    gB(nm, df = F) {
        let v = this.g(nm), m = /^((false|no)|true|yes)?$/i.exec(v);
        return v == N ? df
            : m ? !m[2]
                : thro(`@${nm}: invalid value`);
    }
    NoneLeft() {
        super.delete('hidden');
        if (this.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}
const altProps = {
    "class": "className",
    for: "htmlFor"
}, reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL|SELECT|TITLE)$/, reInline = /^(BUTTON|INPUT|IMG)$/, reWS = /^[ \t\n\r]*$/, Cnms = {}, ChkNm = (obj, nm) => {
    let c = Cnms[nm], r;
    if (!c) {
        c = nm;
        if (!(nm in obj)) {
            r = new RegExp(`^${nm}$`, 'i');
            for (let p in obj)
                if (r.test(p)) {
                    c = p;
                    break;
                }
        }
        Cnms[nm] = c;
    }
    return c;
}, Abbr = (s, m = 60) => s.length > m ?
    s.slice(0, m - 3) + "..."
    : s, mapNm = (m, o) => m.set(o.nm, o), mapSet = (m, nm, v) => v != N ? m.set(nm, v) : m.delete(nm), ErrMsg = (elm, e = Q, maxL) => e + `\nat ${Abbr(/<[^]*?(?=>)/.exec(elm.outerHTML)[0], maxL)}>`, ErrAtt = (e, nm) => thro(nm ? e + `\nat [${nm}]` : e), createErrNode = (msg) => {
    let e = D.createElement('div');
    ass(e.style, { color: 'crimson', fontFamily: 'sans-serif', fontSize: '10pt' });
    e.innerText = msg;
    return e;
}, NoChilds = (srcE) => {
    for (let node of srcE.childNodes)
        if (node.nodeType == 1
            || node.nodeType == 3
                && !reWS.test(node.nodeValue))
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
}, copySSheets = (S, D) => {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules)
            DSheet.insertRule(rule.cssText);
    }
}, ScrollToHash = () => L.hash && setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6);
function* concI(R, S) {
    for (let x of R)
        yield x;
    for (let x of S)
        yield x;
}
function* mapI(I, f, c) {
    for (let x of I)
        if (!c || c(x))
            yield f(x);
}
function* split(s) {
    if (s)
        for (let v of s.split(','))
            yield v.trim();
}
export function* range(from, count, step = 1) {
    if (count === U) {
        count = from;
        from = 0;
    }
    for (let i = 0; i < count; i++)
        yield from + i * step;
}
export async function RFetch(input, init) {
    let rp = await fetch(input, init);
    if (!rp.ok)
        throw `${init?.method || 'GET'} ${input} returned ${rp.status} ${rp.statusText}`;
    return rp;
}
class DocLoc extends _RVAR {
    constructor() {
        super('docLocation', L.href);
        W.addEventListener('popstate', _ => this.V = L.href);
        let DL = this;
        this.query = new Proxy({}, {
            get(_, key) { return DL.url.searchParams.get(key); },
            set(_, key, val) { DL.V = DL.search(key, val); return true; }
        });
        this.Subscribe(loc => {
            let h = (this.url = new URL(loc)).href;
            h == L.href || history.pushState(N, N, h);
            ScrollToHash();
        }, T, T);
    }
    get subpath() { return L.pathname.slice(this.basepath.length); }
    set subpath(s) {
        this.url.pathname = this.basepath + s;
        this.V = this.url.href;
    }
    search(fld, val) {
        let U = new URL(this.v);
        mapSet(U.searchParams, fld, val);
        return U.href;
    }
    RVAR(fld, df, nm = fld) {
        let rv = RVAR(nm, N, N, v => this.query[fld] = v);
        this.Subscribe(_ => rv.V = this.query[fld] ?? df, T, T);
        return rv;
    }
}
let R, DL = new DocLoc(), reroute = arg => {
    if (typeof arg == 'object') {
        if (arg.ctrlKey)
            return;
        arg.preventDefault();
        arg = arg.target.href;
    }
    DL.V = new URL(arg, DL.V).href;
};
export { DL as docLocation, reroute };
ass(G, { RVAR, range, reroute, RFetch });
W.addEventListener('pagehide', () => chiWins.forEach(w => w.close()));
setTimeout(() => {
    for (let src of D.querySelectorAll('*[rhtml],*[type=RHTML]')) {
        let o = src.getAttribute('rhtml');
        src.removeAttribute('rhtml');
        RCompile(src, o && Ev(`({${o}})`));
    }
}, 0);
