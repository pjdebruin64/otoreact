const U = undefined, N = null, T = true, F = false, Q = '', E = [], W = window, D = document, L = location, G = self, US = "'use strict';", dflts = {
    bShowErrors: T,
    bAutoSubscribe: T,
    bAutoPointer: T,
    preformatted: E,
    storePrefix: "RVAR_",
    version: 1
}, P = new DOMParser(), Ev = eval, ass = Object.assign, now = () => performance.now(), thro = (err) => { throw err; }, NO = () => new Object(null);
class Range {
    constructor(ar, n, text) {
        this.text = text;
        this.n = n;
        if (ar) {
            let { parR: p, prvR: q } = ar;
            if (p && !p.n)
                this.parR = p;
            if (q)
                q.nx = this;
            else if (p)
                p.ch = this;
            ar.prvR = this;
        }
    }
    toString() { return this.text || this.n?.nodeName; }
    get Fst() {
        if (this.parN == N) {
            let { n, ch } = this;
            while (!n && ch) {
                n = ch.Fst;
                ch = ch.nx;
            }
            return n;
        }
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
            if (r.n)
                yield r.n;
            else if (c = r.ch)
                do {
                    yield* Nodes(c);
                } while (c = c.nx);
        })(this);
    }
    erase(par) {
        let { n, ch } = this;
        if (n && par) {
            par.removeChild(n);
            par = N;
        }
        this.ch = N;
        while (ch) {
            ch.bfD?.call(ch.n || par);
            ch.rvars?.forEach(rv => rv._Subs.delete(ch.subs));
            ch.erase(ch.parN ?? par);
            ch.afD?.call(ch.n || par);
            ch = ch.nx;
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
            let D = this.d;
            return (e = env) => {
                let { d, i } = k;
                for (; d < D; d++)
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
export async function RCompile(srcN, setts) {
    if (srcN.isConnected && !srcN.b)
        try {
            srcN.b = T;
            let m = L.href.match(`^.*(${setts?.basePattern || '/'})`), C = new RComp(N, L.origin + (DL.basepath = m ? new URL(m[0]).pathname.replace(/[^/]*$/, Q) : Q), setts);
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
    let { parN, r } = ar, sub = { parN }, cr;
    if (cr = !r) {
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
}, PrepElm = (ar, tag) => {
    let r = ar.r, cr;
    if (cr = !r)
        r = new Range(ar, ar.srcN
            || ar.parN.insertBefore(D.createElement(tag), ar.bfor));
    else
        ar.r = r.nx || T;
    nodeCnt++;
    return {
        r,
        sub: {
            parN: pn = r.n,
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
        r.n.data = data;
        ar.r = r.nx || T;
    }
    nodeCnt++;
}, dU = _ => U, dB = async () => { }, chWins = new Set(), OMods = new Map();
function SetLVars(vars, data) {
    vars.forEach((v, i) => v(data[i]));
}
class Signat {
    constructor(srcE, RC) {
        this.srcE = srcE;
        this.Params = [];
        this.Slots = new Map();
        this.nm = srcE.tagName;
        for (let attr of srcE.attributes) {
            let [a, m, rp, dum, nm, on, q] = /^(#|@|(\.\.\.)|(_)|)((on)?.*?)(\?)?$/.exec(attr.name), v = attr.value;
            if (!dum) {
                if (this.RP)
                    throw `Rest parameter must be last`;
                if (!nm && !rp)
                    throw 'Empty parameter name';
                let pDf = v ? m ? RC.CExpr(v, a) : RC.CText(v, a)
                    : on && (() => dU);
                this.Params.push({
                    mode: m,
                    nm,
                    rq: !(q || pDf || rp),
                    pDf: m == '@' ? () => RVAR(Q, pDf?.()) : pDf
                });
                this.RP = rp && nm;
            }
        }
        let { ct } = RC.CT, s;
        RC.CT.ct = Q;
        try {
            for (let eSlot of srcE.children) {
                mapNm(this.Slots, s = new Signat(eSlot, RC));
                if (/^CONTENT/.test(s.nm)) {
                    if (this.CSlot)
                        throw 'Multiple content slots';
                    this.CSlot = s;
                }
            }
        }
        finally {
            RC.CT.ct = ct;
        }
    }
    IsCompat(sig) {
        if (sig) {
            let c = T, mP = new Map(mapI(sig.Params, p => [p.nm, p])), p;
            for (let { nm, rq } of this.Params)
                if (c && (c = p = mP.get(nm))) {
                    c && (c = rq || !p.rq);
                    mP.delete(nm);
                }
            for (let p of mP.values())
                c && (c = !p.rq);
            for (let [nm, slotSig] of this.Slots)
                c && (c = sig.Slots.get(nm)?.IsCompat(slotSig));
            return c;
        }
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
            init.then(v => this.V = v, oes.e)
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
            (this.v = U,
                t.then(v => this.V = v, oes.e))
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
                if (subs.T)
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
function Subs({ parN, parR }, b, r, bR = false) {
    let eon = { env, oes, pn };
    return ass(() => (({ env, oes, pn } = eon),
        b({ parN, parR, r: r || T }, bR)), { T });
}
let env, pn, oes = { e: N, s: N }, Jobs = new Set(), hUpdate, ro = F, upd = 0, nodeCnt = 0, start, NoTime = (prom) => {
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
function ApplyMods(r, cr, ms, k = 0, xs) {
    ro = T;
    let e = r.n, cu = cr ? 1 : 2, hc = F, i = 0, H;
    try {
        for (let M of ms) {
            if (M.cu & cu) {
                let nm = M.nm, x = xs ? xs[i] : M.d();
                switch (M.mt) {
                    case 0:
                        e.setAttribute(nm, x);
                        break;
                    case 1:
                        if (M.isS ?? (M.isS = typeof e[M.c = ChkNm(e, nm == 'for' ? 'htmlFor'
                            : nm == 'valueasnumber' && e.type == 'number'
                                ? 'value'
                                : nm)] == 'string'))
                            x = x == N ? Q : x.toString();
                        if (x !== e[nm = M.c])
                            e[nm] = x;
                        break;
                    case 7:
                        if (cr) {
                            (H = r[k] = new Hndlr()).oes = oes;
                            e.addEventListener(nm, H.hndl.bind(H));
                        }
                        else
                            H = r[k];
                        H.h = x;
                        if (M.ap)
                            e.style.cursor = (hc || (hc = x && !e.disabled)) ? 'pointer' : Q;
                        break;
                    case 4:
                        if (x)
                            typeof x == 'string'
                                ? (e.style = x)
                                : ass(e.style, x);
                        break;
                    case 2:
                        e.style[M.c || (M.c = ChkNm(e.style, nm))] = x || x === 0 ? x : Q;
                        break;
                    case 6:
                        e[nm] = x.replace(/([^, \t\f\r\n]+)((\s.*?)?(,|$))/g, (_, u, r) => new URL(u, M.fp).href + r);
                        break;
                    case 5:
                        ass(e, x);
                        break;
                    case 3:
                        let p = r[k], n = M.cu & 2 ? (r[k] = new Set()) : N;
                        function AC(C) {
                            if (C) {
                                p?.delete(C)
                                    || e.classList.add(C);
                                n?.add(C);
                            }
                        }
                        if (x)
                            switch (typeof x) {
                                case 'string':
                                    x.split(/\s+/).forEach(AC);
                                    break;
                                case 'object':
                                    if (Array.isArray(x))
                                        x.forEach(AC);
                                    else
                                        for (let [nm, b] of Object.entries(x))
                                            b && AC(nm);
                                    break;
                                default: throw `Invalid value`;
                            }
                        if (p)
                            for (let v of p)
                                e.classList.remove(v);
                        break;
                    case 8:
                        if (x)
                            k = ApplyMods(r, cr, x.ms, k, x.xs);
                        break;
                    case 9:
                        x.call(e);
                        break;
                    case 10:
                        if (!e.download
                            && !e.target
                            && e.href.startsWith(L.origin + DL.basepath))
                            e.addEventListener('click', reroute);
                }
            }
            i++;
            k++;
        }
    }
    finally {
        ro = F;
    }
    return k;
}
class Hndlr {
    hndl(ev, ...r) {
        if (this.h)
            try {
                var { e, s } = this.oes, a = this.h.call(ev.currentTarget, ev, ...r);
                a === false && ev.preventDefault();
                a instanceof Promise
                    ? a.then(_ => s?.(ev), e)
                    : s?.(ev);
            }
            catch (er) {
                (e || thro)(er);
            }
    }
}
let iRC = 0, iStyle = 0;
class RComp {
    constructor(RC, FP, settings, CT = RC?.CT) {
        this.num = iRC++;
        this.cRvars = NO();
        this.rActs = [];
        this.sPRE = new Set(['PRE']);
        this.ws = 1;
        this.rt = T;
        this.S = { ...RC ? RC.S : dflts, ...settings };
        this.FP = FP || RC?.FP;
        this.doc = RC?.doc || D;
        this.hd = RC?.hd || this.doc.head;
        this.CT = new Context(CT, T);
        this.lscl = RC?.lscl || E;
        this.ndcl = RC?.ndcl || 0;
    }
    Framed(Comp) {
        let { CT, rActs } = this, { ct, d, L, M } = CT, A = rActs.length, nf = L - M;
        if (nf) {
            CT.ct = `[${ct}]`;
            CT.d++;
            CT.L = CT.M = 0;
        }
        return Comp((sub, r) => {
            let e = env;
            r || ({ r, sub } = PrepRng(sub));
            (env = r.env) || ((env = r.env = [nf ? e : e[0]]).cl = e.cl);
            return { sub, EF: () => { env = e; } };
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
        if (nm = nm?.trim()) {
            try {
                if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm))
                    throw N;
                Ev(`let ${nm}=0`);
            }
            catch {
                throw `Invalid identifier '${nm}'`;
            }
            let { CT } = this, i = ++CT.L, vM = CT.lvMap, p = vM.get(nm);
            vM.set(nm, { d: CT.d, i });
            this.rActs.push(() => mapSet(vM, nm, p));
            CT.ct = CT.ct.replace(new RegExp(`\\b${nm}\\b`), Q)
                + ',' + nm;
            var lv = (v => env[i] = v);
        }
        else
            lv = dU;
        lv.nm = nm;
        return lv;
    }
    LVars(varlist) {
        return Array.from(split(varlist), nm => this.LVar(nm));
    }
    LCons(listS) {
        let { CT } = this, { csMap: cM, M, d } = CT;
        for (let S of listS) {
            let m = S.nm, p = cM.get(m);
            cM.set(m, { S, k: { d, i: --CT.M } });
            this.rActs.push(() => mapSet(cM, m, p));
        }
        return (CDefs) => {
            let i = M;
            for (let C of CDefs)
                env[--i] = C;
        };
    }
    InHead(b) {
        return async (ar) => {
            let { parN, bfor } = ar, p;
            ass(ar, { parN: this.hd, bfor: N });
            try {
                return await b(ar);
            }
            finally {
                if (p = ar.prvR)
                    p.parN = ar.parN;
                ass(ar, { parN, bfor });
            }
        };
    }
    async Compile(elm, nodes) {
        for (let tag of this.S.preformatted)
            this.sPRE.add(tag.toUpperCase());
        this.srcNodeCnt = 0;
        let t0 = now(), b = (nodes
            ? await this.CIter(nodes)
            : await this.CElm(elm, T)) || dB;
        this.log(`Compiled ${this.srcNodeCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
        return this.bldr = b;
    }
    log(msg) {
        if (this.S.bTiming)
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
        let { rt } = this, arr = Array.from(iter);
        while (rt && arr.length && reWS.test(arr[arr.length - 1]?.nodeValue))
            arr.pop();
        let bldrs = await this.CArr(arr, this.rt), l = bldrs.length;
        return !l ? N
            : l > 1 ? async function Iter(ar) {
                for (let b of bldrs)
                    await b(ar);
            }
                : bldrs[0];
    }
    async CArr(arr, rt, i = 0) {
        let bldrs = [], L = arr.length, rv;
        while (i < L) {
            let srcN = arr[i++], bl;
            this.rt = i == L && rt;
            switch (srcN.nodeType) {
                case 1:
                    this.srcNodeCnt++;
                    if (rv = (bl = await this.CElm(srcN))?.auto)
                        try {
                            bldrs.push(bl);
                            var gv = this.CT.getLV(rv), s = this.cRvars[rv], bs = await this.CArr(arr, rt, this.cRvars[rv] = i);
                            bl = bs.length && this.cRvars[rv]
                                ? async function Auto(ar) {
                                    let { r, sub, cr } = PrepRng(ar);
                                    if (cr) {
                                        let rvar = gv(), s = rvar._Subs.size;
                                        for (let b of bs)
                                            await b(sub);
                                        if (rvar._Subs.size == s)
                                            rvar.Subscribe(Subs(ar, Auto, r));
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
                    if (this.S.bKeepComments) {
                        let getText = this.CText(srcN.nodeValue, 'Comment');
                        bl = async (ar) => PrepData(ar, getText(), T);
                    }
            }
            if (bl)
                bldrs.push(bl);
        }
        return bldrs;
    }
    async CElm(srcE, bUH) {
        try {
            let tag = srcE.tagName, atts = new Atts(srcE), AL = this.rActs.length, ga = [], bf = [], af = [], bl, auto, constr = this.CT.getCS(tag), b, m, nm;
            for (let [att] of atts)
                if (m =
                    /^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(?:(create|update|destroy)+|compile))$/
                        .exec(att))
                    if (m[1])
                        m[4] && tag != 'REACT'
                            || m[7] && tag == 'FOR'
                            || ga.push({
                                att,
                                m,
                                dV: m[5]
                                    ? this.CHandlr(atts.g(att), att)
                                    : m[8]
                                        ? this.CAttExp(atts, att)
                                        :
                                            this.CAttExpList(atts, att, T)
                            });
                    else {
                        let txt = atts.g(att);
                        if (m[10])
                            (m[9] ? bf : af)
                                .push({
                                att,
                                txt,
                                C: /c/.test(att),
                                U: /u/.test(att),
                                D: /y/.test(att),
                                h: m[9] && this.CHandlr(txt, att)
                            });
                        else
                            Ev(`(function(){${txt}\n})`).call(srcE);
                    }
            if (constr)
                bl = await this.CInstance(srcE, atts, constr);
            else {
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            NoChilds(srcE);
                            let rv = atts.g('rvar'), t = '@value', twv = rv && atts.g(t), dGet = twv ? this.CExpr(twv, t) : this.CParam(atts, 'value'), bUpd = atts.gB('reacting') || atts.gB('updating') || twv, dSet = twv && this.CTarget(twv), dUpd = rv && this.CAttExp(atts, 'updates'), dSto = rv && this.CAttExp(atts, 'store'), dSNm = dSto && this.CParam(atts, 'storename'), vLet = this.LVar(rv || atts.g('let') || atts.g('var', T)), vGet = rv && this.CT.getLV(rv), onMod = rv && this.CParam(atts, 'onmodified');
                            auto = rv && atts.gB('auto', this.S.bAutoSubscribe) && !onMod && rv;
                            bl = async function DEF(ar, bR) {
                                let r = ar.r, v, upd;
                                if (!r || bUpd || bR != N) {
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
                        bl = await this.CIncl(srcE, atts, T);
                        break;
                    case 'IMPORT':
                        {
                            let src = atts.g('src', T), bIncl = atts.gB('include'), bAsync = atts.gB('async'), lvars = this.LVars(atts.g('defines')), imps = Array.from(mapI(srcE.children, ch => new Signat(ch, this))), DC = this.LCons(imps), cTask = OMods.get(src);
                            if (!cTask) {
                                let C = new RComp(this, this.GetPath(src), { bSubf: T }, new Context());
                                C.log(src);
                                cTask =
                                    this.fetchM(src)
                                        .then(iter => C.Compile(N, iter))
                                        .then(b => [b, C.CT]);
                                if (this.S.bSubf != 2)
                                    OMods.set(src, cTask);
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
                            if (!bAsync)
                                for (let sig of imps)
                                    sig.task = task;
                            bl = async function IMPORT(ar) {
                                let { sub, cr, r } = PrepRng(ar, srcE);
                                if (cr || bIncl) {
                                    try {
                                        var b = await NoTime(task), s = env, MEnv = env = r.v || (r.v = []);
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
                        b = await this.CChilds(srcE);
                        bl = b && function REACT(sub) { return b(PrepRng(sub, srcE).sub); };
                        break;
                    case 'RHTML':
                        {
                            let { ws, rt, FP } = this, b = await this.CUncN(srcE), dSrc = !b && this.CParam(atts, 'srctext'), dO = this.CParam(atts, "onç"), s = { bSubf: 2, bTiming: this.S.bTiming };
                            bl = async function RHTML(ar) {
                                let { r, sub } = PrepElm(ar, 'r-html'), src = b ? (await b(sub)).innerText : dSrc?.();
                                if (src != r.src) {
                                    let sv = env, C = ass(new RComp(N, FP, s), { ws, rt }), parN = C.hd = r.n.shadowRoot || r.n.attachShadow({ mode: 'open' }), parR = r.pR || (r.pR = new Range(N, N, tag)), tmp = D.createElement(tag);
                                    (C.doc = D.createDocumentFragment()).appendChild(tmp);
                                    parR.erase(parN);
                                    parN.innerHTML = Q;
                                    try {
                                        tmp.innerHTML = r.src = src;
                                        await C.Compile(tmp, tmp.childNodes);
                                        dO && dO()(U);
                                        await C.Build({ parN, parR });
                                    }
                                    catch (e) {
                                        parN.appendChild(crErrN(`Compile error: ` + e));
                                    }
                                    finally {
                                        env = sv;
                                    }
                                }
                                pn = ar.parN;
                            };
                        }
                        break;
                    case 'SCRIPT':
                        bl = await this.CScript(srcE, atts);
                        break;
                    case 'COMPONENT':
                        bl = await this.CComponent(srcE, atts);
                        break;
                    case 'DOCUMENT':
                        {
                            let vDoc = this.LVar(atts.g('name', T)), bEncaps = atts.gB('encapsulate'), PC = this, RC = new RComp(this), vParams = RC.LVars(atts.g('params')), vWin = RC.LVar(atts.g('window', F, F, T)), H = RC.hd = D.createDocumentFragment(), b = await RC.CChilds(srcE);
                            bl = async function DOCUMENT(ar) {
                                if (!ar.r) {
                                    let { doc, hd } = PC, docEnv = env, wins = new Set();
                                    vDoc({
                                        async render(w, cr, args) {
                                            let s = env, Cdoc = RC.doc = w.document;
                                            RC.hd = Cdoc.head;
                                            env = docEnv;
                                            SetLVars(vParams, args);
                                            vWin(w);
                                            try {
                                                if (cr) {
                                                    if (!bEncaps)
                                                        copySSheets(hd.styleSheets || doc.styleSheets, Cdoc);
                                                    for (let S of H.childNodes)
                                                        Cdoc.head.append(S.cloneNode(T));
                                                }
                                                await b({ parN: Cdoc.body });
                                            }
                                            finally {
                                                env = s;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let w = W.open(Q, target || Q, features), cr = !chWins.has(w);
                                            if (cr) {
                                                w.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                    this.close(); });
                                                w.addEventListener('close', () => chWins.delete(w), wins.delete(w));
                                                chWins.add(w);
                                                wins.add(w);
                                            }
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
                                            wins.forEach(w => w.close());
                                        }
                                    });
                                }
                            };
                        }
                        break;
                    case 'RHEAD':
                        let { ws } = this;
                        this.ws = this.rt = 1;
                        b = await this.CChilds(srcE);
                        this.ws = ws;
                        bl = b && this.InHead(b);
                        break;
                    case 'STYLE':
                        {
                            let src = atts.g('src'), sc = atts.g('scope'), nm, { lscl: l, hd } = this;
                            if (sc) {
                                /^local$/i.test(sc) || thro('Invalid scope');
                                nm = `\uFFFE${iStyle++}`;
                                this.lscl = [...l, nm];
                                this.rActs.push(() => this.lscl = l);
                            }
                            (src ? this.FetchText(src) : Promise.resolve(srcE.innerText))
                                .then(txt => {
                                if (src || nm)
                                    srcE.innerHTML = AddClass(txt, nm);
                                hd.appendChild(srcE);
                            });
                            atts.clear();
                        }
                        break;
                    case 'RSTYLE': {
                        let s = [this.S.bDollarRequired, this.rIS, this.ws], sc = atts.g('scope'), { bf, af } = this.CAtts(atts), i;
                        try {
                            this.S.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = 1;
                            let b = await (sc ?
                                (/^local$/i.test(sc) || thro('Invalid scope')
                                    , (i = this.ndcl++)
                                    , this.rActs.push(() => this.ndcl--)
                                    , this.CUncN(srcE, atts))
                                : this.CIncl(srcE, atts));
                            bl = b && async function RSTYLE(ar) {
                                let { r, cr, sub } = PrepElm(ar, 'STYLE'), k = ApplyMods(r, cr, bf);
                                if (sc) {
                                    let txt = (await b(ar)).innerText, nm = r.cn || (r.cn = `\uFFFE${iStyle++}`);
                                    if (txt != r.tx)
                                        r.n.innerHTML = AddClass(r.tx = txt, nm);
                                    (env.cl = r.cl || (r.cl = [...env.cl || E]))[i] = nm;
                                }
                                else
                                    await b(sub);
                                ApplyMods(r, cr, af, k);
                                pn = ar.parN;
                            };
                        }
                        finally {
                            [this.S.bDollarRequired, this.rIS, this.ws] = s;
                        }
                        break;
                    }
                    case 'ELEMENT':
                        bl = await this.CHTML(srcE, atts, this.CParam(atts, 'tagname', T));
                        this.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dNm = this.CParam(atts, 'name', T), dVal = this.CParam(atts, 'value', T);
                        bl = async function ATTRIB(ar) {
                            let r = PrepRng(ar, srcE).r, n0 = r.v, nm = r.v = dNm();
                            if (n0 && nm != n0)
                                pn.removeAttribute(n0);
                            if (nm)
                                pn.setAttribute(nm, dVal());
                        };
                        break;
                    case 'COMMENT':
                        {
                            let { ws } = this, b = (this.rt = F, this.ws = 4,
                                await this.CUncN(srcE));
                            bl = async function COMMENT(ar) {
                                PrepData(ar, (await b(ar)).innerText, T);
                            };
                            this.ws = ws;
                        }
                        break;
                    default:
                        bl = await this.CHTML(srcE, atts, U, bUH);
                }
                if (!bUH)
                    atts.NoneLeft();
            }
            nm = (bl || (bl = dB)).name;
            if (bf.length || af.length) {
                for (let g of af)
                    g.h = this.CHandlr(g.txt, g.att);
                let b = bl;
                bl = async function Pseudo(ar, bR) {
                    let { r, prvR } = ar, bfD;
                    for (let g of bf) {
                        if (g.D)
                            bfD = g.h();
                        if (r ? g.U : g.C)
                            g.h().call(r?.n || pn);
                    }
                    await b(ar, bR);
                    let rng = (r ?
                        ar.r != r && r
                        : ar.prvR != prvR && ar.prvR)
                        || PrepRng(ar).r;
                    rng.bfD = bfD;
                    for (let g of af) {
                        if (g.D)
                            rng.afD = g.h();
                        if (r ? g.U : g.C)
                            g.h().call(rng.n || pn);
                    }
                };
            }
            for (let { att, m, dV } of this.S.version ? ga : ga.reverse()) {
                let b = bl, es = m[6] ? 'e' : 's';
                if (m[2]) {
                    let R = async (ar, bR) => {
                        let { r, sub } = PrepRng(ar, srcE, att);
                        if (r.upd != upd)
                            await b(sub, bR);
                        r.upd = upd;
                        return r;
                    }, RE = this.ErrH(R, srcE), bTR = !!m[3];
                    bl = async function REACT(ar, bR) {
                        let r = await R(ar, bR), s = r.subs || (r.subs = Subs(ar, RE, r, bTR)), pv = r.rvars, i = 0;
                        for (let rvar of r.rvars = dV())
                            try {
                                if (pv) {
                                    let p = pv[i++];
                                    if (rvar == p)
                                        continue;
                                    p._Subs.delete(s);
                                }
                                rvar.Subscribe(s);
                            }
                            catch {
                                ErrAtt('This is not an RVAR', att);
                            }
                    };
                }
                else
                    bl =
                        m[5]
                            ? async function SetOnES(ar, bR) {
                                let s = oes, { sub, r } = PrepRng(ar, srcE, att);
                                oes = ass(r.oes || (r.oes = {}), oes);
                                try {
                                    oes[es] = dV();
                                    await b(sub, bR);
                                }
                                finally {
                                    oes = s;
                                }
                            }
                            : m[7]
                                ? function HASH(ar, bR) {
                                    let { sub, r, cr } = PrepRng(ar, srcE, att), ph = r.v;
                                    r.v = dV();
                                    if (cr || r.v.some((hash, i) => hash !== ph[i]))
                                        return b(sub, bR);
                                }
                                : m[8]
                                    ? function hIf(ar, bR) {
                                        let c = dV(), p = PrepRng(ar, srcE, att, 1, !c);
                                        if (c)
                                            return b(p.sub, bR);
                                    }
                                    :
                                        function renew(sub, bR) {
                                            return b(PrepRng(sub, srcE, att, 2).sub, bR);
                                        };
            }
            return bl != dB && ass(this.ErrH(bl, srcE, this.rActs.length > AL), { auto, nm });
        }
        catch (e) {
            throw ErrMsg(srcE, e);
        }
    }
    ErrH(b, srcN, bA) {
        return b && (async (ar, bR) => {
            let r = ar.r;
            if (r?.eN) {
                pn.removeChild(r.eN);
                r.eN = U;
            }
            try {
                await b(ar, bR);
            }
            catch (m) {
                let msg = srcN instanceof HTMLElement ? ErrMsg(srcN, m, 39) : m, e = oes.e;
                if (bA || this.S.bAbortOnError)
                    throw msg;
                this.log(msg);
                if (e)
                    e(m);
                else if (this.S.bShowErrors)
                    (r || {}).eN =
                        ar.parN.insertBefore(crErrN(msg), ar.r?.FstOrNxt);
            }
        });
    }
    CIncl(srcE, atts, bReq) {
        let src = atts?.g('src', bReq);
        if (!src || srcE.children.length || srcE.textContent.trim())
            return this.CChilds(srcE);
        return this.Framed(async (SF) => {
            let C = new RComp(this, this.GetPath(src), { bSubf: T }), task = this.fetchM(src)
                .then(txt => C.Compile(N, txt))
                .catch(e => { alert(e); throw e; });
            return async function INCLUDE(ar) {
                let { sub, EF } = SF(ar);
                await (await NoTime(task))(sub).finally(EF);
            };
        });
    }
    async CUncN(srcE, atts) {
        let b = await this.CIncl(srcE, atts);
        return b && (async (ar) => {
            let { r, sub } = PrepRng(ar, srcE), p = sub.parN = r.p || (r.p = D.createElement(srcE.tagName));
            r.parN = F;
            sub.bfor = N;
            await b(sub);
            return p;
        });
    }
    async CScript(srcE, atts) {
        let { type, text, defer, async } = srcE, src = atts.g('src'), defs = atts.g('defines'), varlist = [...split(defs)], bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), bUpd = atts.gB('updating'), { ct } = this.CT, lvars = mOto && mOto[2] && this.LVars(defs), exp, SetVars = lvars
            ? (e) => SetLVars(lvars, e)
            : (e) => varlist.forEach((nm, i) => G[nm] = e[i]);
        atts.clear();
        if (mOto || (bCls || bMod) && this.S.bSubf) {
            if (mOto?.[3]) {
                let prom = (async () => Ev(US +
                    `(function([${ct}]){{\n${src ? await this.FetchText(src) : text}\nreturn[${defs}]}})`))();
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
        for (let n of srcE.childNodes) {
            if (n instanceof HTMLElement)
                switch (n.tagName) {
                    case 'THEN':
                        var bThen = T;
                        new Atts(n).NoneLeft();
                        caseNodes.push({ n, atts });
                        continue;
                    case 'ELSE':
                    case 'WHEN':
                        caseNodes.push({ n, atts: new Atts(n) });
                        continue;
                }
            body.push(n);
        }
        if (!bThen)
            if (srcE.tagName == 'IF')
                caseNodes.unshift({ n: srcE, atts, body });
            else
                atts.NoneLeft();
        let caseList = [], { ws, rt, CT } = this, postCT = CT, postWs = 0, bE;
        for (let { n, atts, body } of caseNodes) {
            let ES = ass(this, { ws, rt, CT: new Context(CT) })
                .SS();
            try {
                let cond, not = F, patt, p;
                switch (n.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp(atts, 'cond');
                        not = atts.gB('not');
                        patt = dVal && ((p = atts.g('match') ?? atts.g('pattern')) != N
                            ? this.CPatt(p)
                            : (p = atts.g('urlmatch')) != N
                                ? this.CPatt(p, T)
                                : (p = atts.g('regmatch') || atts.g('regexp')) != N
                                    ? { RE: new RegExp(p, 'i'),
                                        lvars: this.LVars(atts.g('captures'))
                                    }
                                    : N);
                        if (patt?.lvars.length && (bHiding || not))
                            throw `Pattern capturing can't be combined with 'hiding' or 'not'`;
                    case 'ELSE':
                        caseList.push({
                            cond, not, patt,
                            b: await this.CChilds(n, body) || dB,
                            n
                        });
                        atts.NoneLeft();
                        postWs = Math.max(postWs, this.ws);
                        postCT = postCT.max(this.CT);
                        bE || (bE = cond === U);
                }
            }
            catch (e) {
                throw n.tagName == 'IF' ? e : ErrMsg(n, e);
            }
            finally {
                ES();
            }
        }
        this.ws = !bE && ws > postWs ? ws : postWs;
        this.CT = postCT;
        return caseList.length && async function CASE(ar, bR) {
            let val = dVal?.(), RRE, cAlt;
            try {
                for (var alt of caseList)
                    if (!((!alt.cond || alt.cond())
                        && (!alt.patt || val != N && (RRE = alt.patt.RE.exec(val)))) == alt.not) {
                        cAlt = alt;
                        break;
                    }
            }
            catch (e) {
                throw alt.n.tagName == 'IF' ? e : ErrMsg(alt.n, e);
            }
            finally {
                if (bHiding) {
                    for (let alt of caseList) {
                        let { r, sub, cr } = PrepElm(ar, 'WHEN');
                        if (!(r.n.hidden = alt != cAlt) && !bR
                            || cr)
                            await alt.b(sub);
                    }
                    pn = ar.parN;
                }
                else {
                    let { sub, cr } = PrepRng(ar, srcE, Q, 1, cAlt);
                    if (cAlt && (cr || !bR)) {
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
        let letNm = atts.g('let'), ixNm = atts.g('index', F, F, T);
        this.rt = F;
        if (letNm != N) {
            let dOf = this.CAttExp(atts, 'of', T), pvNm = atts.g('previous', F, F, T), nxNm = atts.g('next', F, F, T), dUpd = this.CAttExp(atts, 'updates'), bRe = atts.gB('reacting') || atts.gB('reactive') || dUpd;
            return this.Framed(async (SF) => {
                let vLet = this.LVar(letNm), vIx = this.LVar(ixNm), vPv = this.LVar(pvNm), vNx = this.LVar(nxNm), dKey = this.CAttExp(atts, 'key'), dHash = this.CAttExpList(atts, 'hash'), b = await this.CIter(srcE.childNodes);
                return b && async function FOR(ar, bR) {
                    let { r, sub } = PrepRng(ar, srcE, Q), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Nxt, iter = dOf() || E, pIter = async (iter) => {
                        if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                            throw `[of] Value (${iter}) is not iterable`;
                        let keyMap = r.v || (r.v = new Map()), nwMap = new Map(), ix = 0, { EF } = SF(N, {});
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
                            EF();
                        }
                        let nxChR = r.ch, entries = nwMap.entries(), nx = entries.next(), prItem, prvR, k;
                        sub.parR = r;
                        while (T) {
                            while (nxChR && !nwMap.has(k = nxChR.key)) {
                                if (k != N)
                                    keyMap.delete(k);
                                nxChR.erase(parN);
                                if (nxChR.subs)
                                    nxChR.rvars[0]._Subs.delete(nxChR.subs);
                                nxChR.pv = N;
                                nxChR = nxChR.nx;
                            }
                            if (nx.done)
                                break;
                            let [key, { item, hash, ix }] = nx.value, chR = keyMap.get(key), cr = !chR, chAr;
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
                                            chR.pv.nx = chR.nx;
                                            if (chR.nx)
                                                chR.nx.pv = chR.pv;
                                            let nxNode = nxChR?.FstOrNxt || bfor;
                                            for (let n of chR.Nodes())
                                                parN.insertBefore(n, nxNode);
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
                            chR.pv = prvR;
                            prvR = chR;
                            nx = entries.next();
                            if (cr ||
                                !bR && (!hash || hash.some((h, i) => h != chR.hash[i]))) {
                                chR.hash = hash;
                                let { sub, EF } = SF(chAr, chR);
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
                                    vNx(nx.value?.item);
                                    await b(sub);
                                    if (bRe && !chR.subs)
                                        item.Subscribe(chR.subs = Subs(sub, b, chR.ch));
                                }
                                finally {
                                    EF();
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
                        let subEnv = { env, oes };
                        r.rvars = [
                            RVAR(N, iter)
                                .Subscribe(r.subs =
                                ass(iter => (({ env, oes } = subEnv),
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
            return this.Framed(async (SF) => {
                let vIx = this.LVar(ixNm), DC = this.LCons([S]), b = await this.CChilds(srcE);
                return b && async function FOREACH_Slot(ar) {
                    let { templs: tmplts, env } = dC(), { EF, sub } = SF(ar), i = 0;
                    try {
                        for (let slotBldr of tmplts) {
                            vIx(i++);
                            DC([
                                { nm, templs: [slotBldr], env }
                            ]);
                            await b(sub);
                        }
                    }
                    finally {
                        EF();
                    }
                };
            });
        }
    }
    async CComponent(srcE, atts) {
        let bRec = atts.gB('recursive'), { hd, ws } = this, eStyles = atts.gB('encapsulate')
            && (this.hd = D.createDocumentFragment()).children, arr = Array.from(srcE.children), eSig = arr.shift() || thro('Missing signature(s)'), eTem = arr.pop(), t = /^TEMPLATE(S)?$/.exec(eTem?.tagName) || thro('Missing template(s)'), signats = [], CDefs = [];
        for (let elm of /^SIGNATURES?$/.test(eSig.tagName)
            ? eSig.children
            : [eSig])
            signats.push(new Signat(elm, this));
        try {
            var DC = bRec && this.LCons(signats), ES = this.SS(), b = this.ErrH(await this.CIter(arr), srcE), mapS = new Map(mapI(signats, S => [S.nm, S]));
            for (let [nm, elm, body] of t[1]
                ? mapI(eTem.children, elm => [elm.tagName, elm, elm])
                : [
                    [signats[0].nm, eTem, eTem.content]
                ]) {
                CDefs.push({
                    nm,
                    templs: [await this.CTempl(mapS.get(nm) || thro(`Template <${nm}> has no signature`), elm, F, U, body, eStyles)]
                });
                mapS.delete(nm);
            }
            for (let [nm] of mapS)
                throw `Signature <${nm}> has no template`;
        }
        finally {
            ES();
            ass(this, { head: hd, ws });
        }
        DC || (DC = this.LCons(signats));
        return async function COMP(ar) {
            DC(CDefs.map(C => ({ ...C, env })));
            await b?.(ar);
        };
    }
    CTempl(S, srcE, bSlot, atts, body = srcE, eStyles) {
        return this.Framed(async (SF) => {
            this.ws = this.rt = 1;
            let myAtts = atts || new Atts(srcE), lvars = S.Params.map(({ mode, nm }) => {
                let lnm = myAtts.g(nm) ?? myAtts.g(mode + nm);
                return [nm, this.LVar(lnm || (lnm === Q || !bSlot ? nm : N))];
            }), DC = (!atts && myAtts.NoneLeft(),
                this.LCons(S.Slots.values())), b = await this.CIter(body.childNodes), tag = /^[A-Z].*-/.test(S.nm) ? S.nm : 'rhtml-' + S.nm;
            return b && async function TEMPL(args, mSlots, env, ar) {
                if (!ar.r)
                    for (let { nm, pDf } of S.Params)
                        if (pDf && args[nm] === U)
                            args[nm] = pDf();
                ro = F;
                let { sub, EF } = SF(ar);
                for (let [nm, lv] of lvars)
                    lv(args[nm]);
                DC(mapI(S.Slots.keys(), nm => ({ nm,
                    templs: mSlots.get(nm) || E,
                    env
                })));
                if (eStyles) {
                    let { r: { n }, sub: s, cr } = PrepElm(sub, tag), SR = s.parN = n.shadowRoot || n.attachShadow({ mode: 'open' });
                    if (cr)
                        for (let sn of eStyles)
                            SR.appendChild(sn.cloneNode(T));
                    sub = s;
                }
                await b(sub).finally(EF);
                pn = ar.parN;
            };
        }).catch(e => { throw ErrMsg(srcE, `<${S.nm}> template: ` + e); });
    }
    async CInstance(srcE, atts, { S, dC }) {
        await S.task;
        let { RP, CSlot, Slots } = S, gArgs = [], SBldrs = new Map(mapI(Slots, ([nm]) => [nm, []]));
        for (let { mode, nm, rq } of S.Params)
            if (nm != RP) {
                let dG, dS;
                if (mode == '@') {
                    let ex = atts.g(mode + nm, rq);
                    dG = this.CExpr(ex, mode + nm);
                    dS = this.CTarget(ex);
                }
                else
                    dG = this.CParam(atts, nm, rq);
                if (dG)
                    gArgs.push({ nm, dG, dS });
            }
        let slotE, slot, nm;
        for (let n of Array.from(srcE.children))
            if ((slot = Slots.get(nm = (slotE = n).tagName))
                && slot != CSlot) {
                SBldrs.get(nm).push(await this.CTempl(slot, slotE, T));
                srcE.removeChild(n);
            }
        if (CSlot)
            SBldrs.get(CSlot.nm).push(await this.CTempl(CSlot, srcE, T, atts));
        if (RP) {
            let { bf, af } = this.CAtts(atts);
            bf.push(...af);
            gArgs.push({
                nm: RP,
                dG: () => ({ ms: bf, xs: bf.map(M => M.d()) })
            });
        }
        atts.NoneLeft();
        this.ws = 3;
        return async function INST(ar) {
            let { r, sub, cr } = PrepRng(ar, srcE), sEnv = env, cdef = dC(), args = r.args || (r.args = NO());
            if (cdef) {
                ro = T;
                try {
                    for (let { nm, dG, dS } of gArgs)
                        if (!dS)
                            args[nm] = dG();
                        else if (cr)
                            args[nm] = RVAR(Q, dG(), N, dS());
                        else
                            args[nm].V = dG();
                    env = cdef.env;
                    for (let tmpl of cdef.templs)
                        await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {
                    env = sEnv;
                    ro = F;
                }
            }
        };
    }
    async CHTML(srcE, atts, dTag, bUH) {
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, Q), preWs = this.ws, postWs;
        if (this.sPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
            this.ws = 4;
            postWs = 1;
        }
        else if (reBlock.test(nm))
            this.ws = this.rt = postWs = 1;
        else if (reInline.test(nm)) {
            this.ws = this.rt = 1;
            postWs = 3;
        }
        if (preWs == 4)
            postWs = preWs;
        let { bf, af } = this.CAtts(atts), b = await this.CChilds(srcE), { lscl, ndcl } = this;
        if (postWs)
            this.ws = postWs;
        if (nm == 'A' && this.S.bAutoReroute && bf.every(({ nm }) => nm != 'click'))
            af.push({ mt: 10, d: dU, cu: 1 });
        if (bUH)
            af.push({ mt: 1, nm: 'hidden', d: dU, cu: 1 });
        bf.length || (bf = U);
        af.length || (af = U);
        return async function ELM(ar, bR) {
            let { r, sub, cr } = PrepElm(ar, nm || dTag()), k = bf && ApplyMods(r, cr, bf);
            if (cr) {
                for (let nm of lscl)
                    r.n.classList.add(nm);
                for (let i = 0; i < ndcl; i++)
                    r.n.classList.add(env.cl[i]);
            }
            if (cr || !bR)
                await b?.(sub);
            af && ApplyMods(r, cr, af, k);
            pn = ar.parN;
        };
    }
    CAtts(atts) {
        let bf = [], af = [], m, ap = this.S.bAutoPointer, addM = (mt, nm, d, cu) => {
            let M = { mt, nm, d,
                cu: cu ??
                    (d.fx != N ? 1 : 3)
            };
            if (ap && mt == 7)
                M.ap = nm == 'click';
            if (mt == 6)
                M.fp = this.FP;
            (mt < 8 && nm != 'value' ? bf : af).push(M);
        };
        for (let [A, V] of atts)
            if (m = /^(?:(([#+.](#)?)?(((class|classname)|style)(?:[.:](\w+))?|on(\w+)\.*|(src|srcset)|(\w*)\.*))|([\*\+#!]+|@@?)(\w*)|\.\.\.(\w+))$/.exec(A)) {
                let [, o, p, h, d, y, c, i, e, s, a, t, k, r] = m;
                if (o) {
                    let dV = p ? this.CExpr(V, A)
                        : e ? this.CHandlr(V, A)
                            : this.CText(V, A);
                    addM(c ? 3
                        : y ? i ? 2 : 4
                            : e ? 7
                                : s ? 6
                                    : p ? d ? 1 : 5
                                        : 0, a || e || i || d, i && c
                        ? () => Object.fromEntries([[i, dV()]])
                        : dV, h && 1);
                }
                else if (t) {
                    let cu, dS = this.CTarget(V), cnm, dSet = () => {
                        let S = dS();
                        return k ?
                            function () { S(this[cnm || (cnm = ChkNm(this, k))]); }
                            : function () { S(this); };
                    };
                    if (m = /[@#](#)?/.exec(t))
                        addM(1, k, this.CExpr(V, k), m[1] && 1);
                    if (cu = /\*/.test(t) + /\+/.test(t) * 2)
                        addM(9, k, dSet, cu);
                    if (m = /([@!])(\1)?/.exec(t))
                        addM(7, m[2] ? 'change' : 'input', dSet);
                }
                else {
                    if (V)
                        throw 'A rest parameter cannot have a value';
                    addM(8, A, this.CT.getLV(r));
                }
                atts.delete(A);
            }
        return { bf, af };
    }
    CText(text, nm) {
        let f = (re) => `(?:\\{(?:\\{${re}\\}|[^])*?\\}\
|'(?:\\\\.|[^])*?'\
|"(?:\\\\.|[^])*?"\
|\`(?:\\\\[^]|\\\$\\{${re}}|[^])*?\`\
|/(?:\\\\.|\[]?(?:\\\\.|.)*?\])*?/\
|[^])*?`, rIS = this.rIS || (this.rIS = new RegExp(`\\\\([{}])|\\$${this.S.bDollarRequired ? Q : '?'}\\{(${f(f(f('[^]*?')))})\\}|$`, 'g')), gens = [], ws = nm || this.S.bKeepWhiteSpace ? 4 : this.ws, fx = Q, iT = T;
        rIS.lastIndex = 0;
        while (T) {
            let lastIx = rIS.lastIndex, m = rIS.exec(text);
            fx += text.slice(lastIx, m.index) + (m[1] || Q);
            if (!m[0] || m[2]?.trim()) {
                if (ws < 4) {
                    fx = fx.replace(/[ \t\n\r]+/g, " ");
                    if (ws <= 2 && !gens.length)
                        fx = fx.replace(/^ /, Q);
                    if (this.rt && !m[0])
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
        let reg = Q, lvars = [], rP = /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\[^])|\[\^?(?:\\[^]|[^\\\]])*\]|$/g;
        while (rP.lastIndex < patt.length) {
            let ix = rP.lastIndex, m = rP.exec(patt), lits = patt.slice(ix, m.index);
            reg +=
                lits.replace(/\W/g, s => '\\' + s)
                    + (m[1] != N
                        ? (lvars.push(this.LVar(m[1])), '(.*?)')
                        : m[0] == '?' ? '.'
                            : m[0] == '*' ? '.*'
                                : m[2] ? m[2]
                                    : m[0]);
        }
        return { lvars, RE: new RegExp(`^${reg}$`, 'i'), url };
    }
    CParam(atts, att, bReq) {
        let txt = atts.g(att);
        return (txt == N ? this.CAttExp(atts, att, bReq)
            : /^on/.test(att) ? this.CHandlr(txt, att)
                : this.CText(txt, att));
    }
    CAttExp(atts, att, bReq) {
        return this.CExpr(atts.g(att, bReq, T), att, U);
    }
    CTarget(expr) {
        return expr == N ? dU : this.Closure(`return $=>(${expr})=$`, ` in assigment target "${expr}"`);
    }
    CHandlr(txt, nm) {
        return this.CExpr(/^#/.test(nm) ? txt : `function(event){${txt}\n}`, nm, txt);
    }
    CExpr(expr, nm, src = expr, dlms = '""') {
        return (expr == N ? expr
            : !/\S/.test(expr) ? thro(`[${nm}] Empty expression`)
                : this.Closure(`return(\n${expr}\n)`, '\nat ' + (nm ? `[${nm}]=` : Q) + dlms[0] + Abbr(src) + dlms[1]));
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
        let { ct, lvMap, d } = this.CT, n = d + 1;
        for (let m of body.matchAll(/\b[A-Z_$][A-Z0-9_$]*\b/gi)) {
            let k = lvMap.get(m[0]);
            if (k?.d < n)
                n = k.d;
        }
        if (n > d)
            ct = Q;
        else {
            let p = d - n, q = p;
            while (n--)
                q = ct.indexOf(']', q) + 1;
            ct = `[${ct.slice(0, p)}${ct.slice(q)}]`;
        }
        try {
            var f = Ev(`${US}(function(${ct}){${body}\n})`);
            return () => {
                try {
                    return f.call(pn, env);
                }
                catch (x) {
                    throw x + E;
                }
            };
        }
        catch (x) {
            throw x + E;
        }
    }
    GetURL(src) {
        return new URL(src, this.FP).href;
    }
    GetPath(src) {
        return this.GetURL(src).replace(/[^/]*$/, Q);
    }
    async FetchText(src) {
        return (await RFetch(this.GetURL(src), { headers: this.S.headers })).text();
    }
    async fetchM(src) {
        let m = this.doc.getElementById(src);
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
            throw `Missing attribute [` + nm + `]`;
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
const reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|[OU]L|P|TABLE|T[RHD]|PRE)$/, reInline = /^(BUTTON|INPUT|IMG|SELECT|TEXTAREA)$/, reWS = /^[ \t\n\r]*$/, AddClass = (txt, nm) => nm ? txt.replaceAll(/{(?:{.*?}|.)*?}|@[msd].*?{|@[^{;]*|(\w|[-.#:()\u00A0-\uFFFF]|\[(?:"(?:\\.|.)*?"|'(?:\\.|.)*?'|.)*?\]|\\[0-9A-F]+\w*|\\.|"(?:\\.|.)*?"|'(?:\\.|.)*?')+/gsi, (m, p) => p ? `${m}.${nm}` : m)
    : txt, Cnms = NO(), ChkNm = (obj, nm) => {
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
    : s, mapNm = (m, o) => m.set(o.nm, o), mapSet = (m, nm, v) => v != N ? m.set(nm, v) : m.delete(nm), ErrMsg = (elm, e = Q, maxL) => e + `\nat ${Abbr(/<[^]*?(?=>)/.exec(elm.outerHTML)[0], maxL)}>`, ErrAtt = (e, nm) => thro(nm ? e + `\nat [${nm}]` : e), crErrN = (msg) => ass(D.createElement('div'), { style: 'color:crimson;font-family:sans-serif;font-size:10pt',
    innerText: msg }), NoChilds = (srcE) => {
    for (let n of srcE.childNodes)
        if (n.nodeType == 1
            || n.nodeType == 3
                && !reWS.test(n.nodeValue))
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
}, copySSheets = (S, D) => {
    for (let SSh of S) {
        let DSh = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSh.cssRules)
            DSh.insertRule(rule.cssText);
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
    for (let i = 0; i < count; i++) {
        yield from;
        from += step;
    }
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
            set(_, key, val) { DL.V = DL.search(key, val); return T; }
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
        arg = arg.currentTarget.href;
    }
    DL.U = new URL(arg, DL.V).href;
};
export { DL as docLocation, reroute };
ass(G, { RVAR, range, reroute, RFetch, DoUpdate
});
W.addEventListener('pagehide', () => chWins.forEach(w => w.close()));
setTimeout(() => {
    for (let src of D.querySelectorAll('*[rhtml],*[type=RHTML]')) {
        let o = src.getAttribute('rhtml');
        src.removeAttribute('rhtml');
        RCompile(src, o && Ev(`({${o}})`));
    }
}, 0);
