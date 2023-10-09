<<<<<<< HEAD
const N = null, T = !0, F = !T, U = void 0, Q = '', E = [], W = window, D = document, L = location, G = self, US = "'use strict';", dflts = {
    bShowErrors: T,
    bAutoSubscribe: T,
    bAutoPointer: T,
    preformatted: E,
    storePrefix: "RVAR_",
    version: 1
}, P = new DOMParser(), Ev = eval, ass = Object.assign, now = () => performance.now(), thro = (err) => { throw err; }, NO = () => new Object(null);
async function Bldrs(bs, ar) {
    for (let b of bs)
        if (await b(ar))
            break;
}
class Range {
    constructor(ar, n, text) {
        this.text = text;
        this.n = n;
        if (ar) {
            let { parR: p, prR: q } = ar;
            if (p && !p.n)
                this.parR = p;
            if (q)
                q.nx = this;
            else if (p)
                p.ch = this;
            ar.prR = this;
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
            ch.bD?.call(ch.n || par);
            ch.rvars?.forEach(rv => rv._Subs.delete(ch.subs));
            ch.erase(ch.parN ?? par);
            ch.aD?.call(ch.n || par);
            ch = ch.nx;
        }
    }
}
class Context {
    constructor(C, a) {
        ass(this, C || {
            d: 0, L: 0, M: 0, ct: Q,
            lvM: new Map(), csM: new Map()
        });
        if (a && C) {
            this.lvM = new Map(this.lvM);
            this.csM = new Map(this.csM);
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
        return this.getV(this.lvM.get(nm) || thro(`Unknown name '${nm}'`));
    }
    getCS(nm) {
        let SK = this.csM.get(nm);
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
            srcN.innerHTML = Q;
            Jobs.add({ Exec: () => C.Build({
                    parN: srcN.parentElement,
                    srcN,
                    bfor: srcN
                }).then(S2Hash)
            });
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
function SetLVs(vars, data) {
    vars.forEach((v, i) => v(data[i]));
}
class Signat {
    constructor(srcE, RC) {
        this.srcE = srcE;
        this.Pams = [];
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
                this.Pams.push({
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
            let c = T, mP = new Map(mapI(sig.Pams, p => [p.nm, p])), p;
            for (let { nm, rq } of this.Pams)
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
            (bImm ? this._Imm || (this._Imm = new Set()) : this._Subs).add(s);
        }
        return this;
    }
    Unsubscribe(s) {
        this._Imm?.delete(s);
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
        this._Imm?.forEach(s => s(this.v));
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
let env, pn, oes = { e: N, s: N }, Jobs = new Set(), hUpd, ro = F, upd = 0, nodeCnt = 0, start, NoTime = (prom) => {
    let t = now();
    return prom.finally(() => { start += now() - t; });
}, RUpd = () => {
    if (!env && !hUpd)
        hUpd = setTimeout(DoUpdate, 1);
};
export async function DoUpdate() {
    hUpd = N;
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
            env = r.env || (r.env = ass([nf ? e : e[0]], { cl: e.cl }));
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
    LV(nm) {
        if (nm = nm?.trim()) {
            try {
                if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm))
                    throw N;
                Ev(`let ${nm}=0`);
            }
            catch {
                throw `Invalid identifier '${nm}'`;
            }
            let { CT } = this, i = ++CT.L, vM = CT.lvM, p = vM.get(nm);
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
        return Array.from(split(varlist), nm => this.LV(nm));
    }
    LCons(listS) {
        let { CT } = this, { csM: cM, M, d } = CT;
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
                if (p = ar.prR)
                    p.parN = ar.parN;
                ass(ar, { parN, bfor });
            }
        };
    }
    async Compile(elm, nodes) {
        for (let tag of this.S.preformatted)
            this.sPRE.add(tag.toUpperCase());
        this.srcCnt = 0;
        let t0 = now(), b = (nodes
            ? await this.CIter(nodes)
            : await this.CElm(elm, T)) || dB;
        this.log(`Compiled ${this.srcCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
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
    CChilds(PN, nodes = PN.childNodes) {
        let ES = this.SS();
        return this.CIter(nodes).finally(ES);
    }
    async CIter(iter) {
        let { rt } = this, arr = Array.from(iter);
        while (rt && arr.length && reWS.test(arr[arr.length - 1]?.nodeValue))
            arr.pop();
        let bs = await this.CArr(arr, this.rt), l = bs.length;
        return !l ? N
            : l < 2 ? bs[0]
                : function Iter(ar) {
                    return Bldrs(bs, ar);
                };
    }
    async CArr(arr, rt, i = 0) {
        let bldrs = [], L = arr.length, rv;
        while (i < L) {
            let srcN = arr[i++], bl;
            this.rt = i == L && rt;
            switch (srcN.nodeType) {
                case 1:
                    this.srcCnt++;
                    if (rv = (bl = await this.CElm(srcN))?.auto)
                        try {
                            bldrs.push(bl);
                            var gv = this.CT.getLV(rv), s = this.cRvars[rv], bs = await this.CArr(arr, rt, this.cRvars[rv] = i);
                            bl = bs.length && this.cRvars[rv]
                                ? async function Auto(ar) {
                                    let { r, sub, cr } = PrepRng(ar);
                                    if (cr) {
                                        let rvar = gv(), s = rvar._Subs.size;
                                        await Bldrs(bs, sub);
                                        if (rvar._Subs.size == s)
                                            rvar.Subscribe(Subs(ar, Auto, r));
                                    }
                                    else if (r.upd != upd)
                                        await Bldrs(bs, sub);
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
                    this.srcCnt++;
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
            let tag = srcE.tagName, ats = new Atts(srcE), ga = [], bf = [], af = [], bl, bA, auto, constr = this.CT.getCS(tag), b, m, nm;
            for (let [at] of ats)
                if (m =
                    /^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(?:create|update|destroy|compile)+)$/
                        .exec(at))
                    if (m[1])
                        m[4] && tag != 'REACT'
                            || m[7] && tag == 'FOR'
                            || ga.push({
                                at,
                                m,
                                dV: m[5]
                                    ? this.CHandlr(ats.g(at), at)
                                    : m[8]
                                        ? this.CAttExp(ats, at)
                                        :
                                            this.CAttExpList(ats, at, T)
                            });
                    else {
                        let txt = ats.g(at);
                        if (/cr|d/.test(at))
                            (m[9] ? bf : af)
                                .push({
                                at,
                                txt,
                                C: /cr/.test(at),
                                U: /u/.test(at),
                                D: /y/.test(at),
                                h: m[9] && this.CHandlr(txt, at)
                            });
                        if (/m/.test(at))
                            Ev(`(function(){${txt}\n})`).call(srcE);
                    }
            if (constr)
                bl = await this.CInstance(srcE, ats, constr);
            else
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            NoChilds(srcE);
                            let rv = ats.g('rvar'), t = '@value', twv = rv && ats.g(t), dGet = twv ? this.CExpr(twv, t) : this.CPam(ats, 'value'), bUpd = ats.gB('reacting') || ats.gB('updating') || twv, dSet = twv && this.CTarget(twv), dUpd = rv && this.CAttExp(ats, 'updates'), dSto = rv && this.CAttExp(ats, 'store'), dSNm = dSto && this.CPam(ats, 'storename'), vLet = this.LV(rv || ats.g('let') || ats.g('var', T)), vGet = rv && this.CT.getLV(rv), onMod = rv && this.CPam(ats, 'onmodified');
                            auto = rv && ats.gB('auto', this.S.bAutoSubscribe) && !onMod && rv;
                            bA = async function DEF(ar, bR) {
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
                        bl = await this.CCase(srcE, ats);
                        break;
                    case 'FOR':
                        bl = await this.CFor(srcE, ats);
                        break;
                    case 'MODULE':
                        ats.g('id');
                        break;
                    case 'INCLUDE':
                        bl = await this.CIncl(srcE, ats, T);
                        break;
                    case 'IMPORT':
                        {
                            let src = ats.g('src', T), bIncl = ats.gB('include'), bAsync = ats.gB('async'), lvars = this.LVars(ats.g('defines')), imps = Array.from(mapI(srcE.children, ch => new Signat(ch, this))), DC = this.LCons(imps), cTask = OMods.get(src);
                            if (!cTask) {
                                let C = new RComp(this, this.GetP(src), { bSubf: T }, new Context());
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
                            bA = async function IMPORT(ar) {
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
                            let { ws, rt } = this, b = await this.CUncN(srcE), dSrc = !b && this.CPam(ats, 'srctext'), dO = this.CPam(ats, "onç"), s = { bSubf: 2, bTiming: this.S.bTiming };
                            bl = async function RHTML(ar) {
                                let { r, sub } = PrepElm(ar, 'r-html'), src = b ? (await b(sub)).innerText : dSrc?.();
                                if (src != r.src) {
                                    let sv = env, C = ass(new RComp(N, L.origin + DL.basepath, s), { ws, rt }), parN = C.hd = r.n.shadowRoot || r.n.attachShadow({ mode: 'open' }), parR = r.pR || (r.pR = new Range(N, N, tag)), tmp = D.createElement(tag);
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
                                        parN.appendChild(crErrN(e));
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
                        bA = await this.CScript(srcE, ats);
                        break;
                    case 'COMPONENT':
                        bA = await this.CComp(srcE, ats);
                        break;
                    case 'DOCUMENT':
                        {
                            let vDoc = this.LV(ats.g('name', T)), bEncaps = ats.gB('encapsulate'), PC = this, RC = new RComp(this), vPams = RC.LVars(ats.g('params')), vWin = RC.LV(ats.g('window', F, F, T)), H = RC.hd = D.createDocumentFragment(), b = await RC.CChilds(srcE);
                            bA = async function DOCUMENT(ar) {
                                if (!ar.r) {
                                    let { doc, hd } = PC, docEnv = env, wins = new Set();
                                    vDoc({
                                        async render(w, cr, args) {
                                            let s = env, Cdoc = RC.doc = w.document;
                                            RC.hd = Cdoc.head;
                                            env = docEnv;
                                            SetLVs(vPams, args);
                                            vWin(w);
                                            try {
                                                if (cr) {
                                                    if (!bEncaps)
                                                        for (let SSh of hd.styleSheets || doc.styleSheets) {
                                                            let DSh = Cdoc.head.appendChild(D.createElement('style')).sheet;
                                                            for (let rule of SSh.cssRules)
                                                                DSh.insertRule(rule.cssText);
                                                        }
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
                                            let f = doc.createElement('iframe');
                                            f.hidden = T;
                                            doc.body.appendChild(f);
                                            await this.render(f.contentWindow, T, args);
                                            f.contentWindow.print();
                                            f.remove();
                                        },
                                        closeAll: () => wins.forEach(w => w.close())
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
                            let src = ats.g('src'), sc = ats.g('scope'), nm, { lscl: l, hd } = this;
                            if (sc) {
                                /^local$/i.test(sc) || thro('Invalid scope');
                                nm = `\uFFFE${iStyle++}`;
                                this.lscl = [...l, nm];
                                this.rActs.push(() => this.lscl = l);
                            }
                            (src ? this.FetchText(src) : Promise.resolve(srcE.innerText))
                                .then(txt => {
                                if (src || nm)
                                    srcE.innerHTML = AddC(txt, nm);
                                hd.appendChild(srcE);
                            });
                            ats.clear();
                        }
                        break;
                    case 'RSTYLE': {
                        let s = [this.S.bDollarRequired, this.rIS, this.ws], sc = ats.g('scope'), { bf, af } = this.CAtts(ats), i;
                        try {
                            this.S.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = 1;
                            let b = await (sc ?
                                (/^local$/i.test(sc) || thro('Invalid scope')
                                    , (i = this.ndcl++)
                                    , this.rActs.push(() => this.ndcl--)
                                    , this.CUncN(srcE, ats))
                                : this.CIncl(srcE, ats));
                            bl = b && async function RSTYLE(ar) {
                                let { r, cr, sub } = PrepElm(ar, 'STYLE'), k = ApplyMods(r, cr, bf);
                                if (sc) {
                                    let txt = (await b(ar)).innerText, nm = r.cn || (r.cn = `\uFFFE${iStyle++}`);
                                    if (txt != r.tx)
                                        r.n.innerHTML = AddC(r.tx = txt, nm);
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
                        bl = await this.CHTML(srcE, ats, this.CPam(ats, 'tagname', T));
                        this.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dN = this.CPam(ats, 'name', T), dV = this.CPam(ats, 'value', T);
                        bl = async function ATTRIB(ar) {
                            let r = PrepRng(ar, srcE).r, n0 = r.v, nm = r.v = dN();
                            if (n0 && nm != n0)
                                pn.removeAttribute(n0);
                            if (nm)
                                pn.setAttribute(nm, dV());
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
                        bl = await this.CHTML(srcE, ats, U, bUH);
                }
            if (!bUH)
                ats.None();
            nm = (bl || (bl = bA || (bA = dB))).name;
            if (bf.length || af.length) {
                for (let g of af)
                    g.h = this.CHandlr(g.txt, g.at);
                let b = bl;
                bl = async function Pseu(ar, bR) {
                    let { r, sub, cr } = PrepRng(ar, srcE), sr = sub.r || T, bD = ph(bf, 'bU', sr != T && sr.n || pn);
                    await b(sub, bR);
                    let rng = (cr
                        ? sub.prR
                        : sub.r != sr && sr)
                        || PrepRng(sub).r, aD = ph(af, 'aU', rng.n || pn);
                    if (cr)
                        ass(rng, { bD, aD });
                    function ph(hh, U, elm) {
                        if (cr) {
                            for (let g of hh) {
                                let h = g.h();
                                if (g.C)
                                    h.call(elm);
                                if (g.U)
                                    r[U] = h;
                                if (g.D)
                                    var D = h;
                            }
                            return D;
                        }
                        r[U]?.call(elm);
                    }
                };
            }
            for (let { at, m, dV } of this.S.version ? ga : ga.reverse()) {
                let b = bl, es = m[6] ? 'e' : 's';
                if (m[2]) {
                    let R = async (ar, bR) => {
                        let { r, sub } = PrepRng(ar, srcE, at);
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
                                throw `This is not an RVAR\nat '${at}'`;
                            }
                    };
                }
                else
                    bl =
                        m[5]
                            ? async function SetOnES(ar, bR) {
                                let s = oes, { sub, r } = PrepRng(ar, srcE, at);
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
                                    let { sub, r, cr } = PrepRng(ar, srcE, at), ph = r.v;
                                    r.v = dV();
                                    if (cr || r.v.some((hash, i) => hash !== ph[i]))
                                        return b(sub, bR);
                                }
                                : m[8]
                                    ? function hIf(ar, bR) {
                                        let c = dV(), p = PrepRng(ar, srcE, at, 1, !c);
                                        if (c)
                                            return b(p.sub, bR);
                                    }
                                    :
                                        function renew(sub, bR) {
                                            return b(PrepRng(sub, srcE, at, 2).sub, bR);
                                        };
            }
            return bl != dB && ass(this.ErrH(bl, srcE, !!bA), { auto, nm });
        }
        catch (m) {
            throw ErrM(srcE, m);
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
                let msg = srcN instanceof HTMLElement ? ErrM(srcN, m, 39) : m, e = oes.e;
                if (this.S.bAbortOnError)
                    throw msg;
                this.log(msg);
                e ? e(m)
                    : this.S.bShowErrors ?
                        (r || {}).eN = ar.parN.insertBefore(crErrN(msg), ar.r?.FstOrNxt)
                        : U;
                return bA;
            }
        });
    }
    CIncl(srcE, ats, bR, cn) {
        let src = ats?.g('src', bR);
        return !src || srcE.children.length || srcE.textContent.trim() ?
            this.CChilds(srcE, cn)
            : this.Framed(async (SF) => {
                let task = this.CSrc(src);
                return async function INCL(ar) {
                    let { sub, EF } = SF(ar);
                    await (await NoTime(task))(sub).finally(EF);
                };
            });
    }
    CSrc(src) {
        let C = new RComp(this, this.GetP(src), { bSubf: T });
        return this.fetchM(src)
            .then(txt => C.Compile(N, txt))
            .catch(e => { alert(e); throw e; });
    }
    async CUncN(srcE, ats) {
        let b = await this.CIncl(srcE, ats);
        return b && (async (ar) => {
            let { r, sub } = PrepRng(ar, srcE), p = sub.parN = r.p || (r.p = D.createElement(srcE.tagName));
            r.parN = F;
            sub.bfor = N;
            await b(sub);
            return p;
        });
    }
    async CScript(srcE, ats) {
        let { type, text, defer, async } = srcE, src = ats.g('src'), defs = ats.g('defines') || '', m = /^\s*(((text|application)\/javascript|)|(module)|(otoreact)(\/((local)|(static)|global)|(.*?)))\s*(;\s*type\s*=\s*(")?module\12)?\s*$|/i.exec(type), bU = ats.gB('updating'), { ct } = this.CT, lvars = m[8] && this.LVars(defs), ex;
        ats.clear();
        if (m[5] && (!m[10] || thro("Invalid script type"))
            || (m[2] != N || m[4]) && this.S.bSubf) {
            if (m[8]) {
                let prom = (async () => Ev(US + `(function([${ct}]){{\n${src ? await this.FetchText(src) : text}\nreturn{${defs}}}})`))();
                ex = async () => (await prom)(env);
            }
            else if (m[4] || m[11]) {
                let pArr = (src
                    ? import(this.GetURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => p1 + this.GetURL(p2) + p3)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src)));
                ex = () => pArr;
            }
            else {
                let pTxt = (async () => `${m[5] ? US : Q}${src ? await this.FetchText(src) : text}\n;({${defs}})`)(), V;
                ex = async () => V || (V = Ev(await pTxt));
                if (src && async)
                    ex();
                else if (!m[5] && !defer)
                    await ex();
            }
            return async function SCRIPT(ar) {
                if (!ar.r || bU) {
                    let obj = await ex();
                    if (lvars)
                        lvars.forEach(lv => lv(obj[lv.nm]));
                    else
                        ass(G, obj);
                }
            };
        }
    }
    async CCase(srcE, ats) {
        let bH = ats.gB('hiding'), dV = this.CAttExp(ats, 'value'), cases = [], body = [], bE;
        for (let n of srcE.childNodes) {
            if (n instanceof HTMLElement)
                switch (n.tagName) {
                    case 'THEN':
                        var bThen = T;
                        new Atts(n).None();
                        cases.push({ n, ats });
                        continue;
                    case 'ELSE':
                        if (bE)
                            throw "Double ELSE";
                        bE = T;
                    case 'WHEN':
                        cases.push({ n, ats: new Atts(n) });
                        continue;
                }
            body.push(n);
        }
        if (srcE.tagName == 'IF' && !bThen)
            cases.unshift({ n: srcE, ats, body });
        let caseList = [], { ws, rt, CT } = this, postCT = CT, postWs = 0;
        for (let { n, ats, body } of cases) {
            let ES = ass(this, { ws, rt, CT: new Context(CT) })
                .SS();
            try {
                let cond, not = F, patt, p;
                switch (n.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp(ats, 'cond');
                        not = ats.gB('not');
                        patt = dV && ((p = ats.g('match') ?? ats.g('pattern')) != N
                            ? this.CPatt(p)
                            : (p = ats.g('urlmatch')) != N
                                ? this.CPatt(p, T)
                                : (p = ats.g('regmatch') || ats.g('regexp')) != N
                                    ? { RE: new RegExp(p, 'i'),
                                        lvars: this.LVars(ats.g('captures'))
                                    }
                                    : N);
                        if (patt?.lvars.length && (bH || not))
                            throw `Pattern capturing can't be combined with 'hiding' or 'not'`;
                    case 'ELSE':
                        caseList.push({
                            cond, not, patt,
                            b: await this.CIncl(n, ats, F, body) || dB,
                            n
                        });
                        ats.None();
                        postWs = Math.max(postWs, this.ws);
                        postCT = postCT.max(this.CT);
                }
            }
            catch (m) {
                throw n.tagName == 'IF' ? m : ErrM(n, m);
            }
            finally {
                ES();
            }
        }
        this.ws = !bE && ws > postWs ? ws : postWs;
        this.CT = postCT;
        return caseList.length && async function CASE(ar, bR) {
            let val = dV?.(), RRE, cAlt;
            try {
                for (var alt of caseList)
                    if (!((!alt.cond || alt.cond())
                        && (!alt.patt || val != N && (RRE = alt.patt.RE.exec(val)))) == alt.not) {
                        cAlt = alt;
                        break;
                    }
            }
            catch (m) {
                throw alt.n.tagName == 'IF' ? m : ErrM(alt.n, m);
            }
            finally {
                if (bH) {
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
                                SetLVs(cAlt.patt.lvars, cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE);
                        await cAlt.b(sub);
                    }
                }
            }
        };
    }
    CFor(srcE, ats) {
        let letNm = ats.g('let'), ixNm = ats.g('index', F, F, T);
        this.rt = F;
        if (letNm != N) {
            let dOf = this.CAttExp(ats, 'of', T), pvNm = ats.g('previous', F, F, T), nxNm = ats.g('next', F, F, T), dUpd = this.CAttExp(ats, 'updates'), bRe = ats.gB('reacting') || ats.gB('reactive') || dUpd;
            return this.Framed(async (SF) => {
                let vLet = this.LV(letNm), vIx = this.LV(ixNm), vPv = this.LV(pvNm), vNx = this.LV(nxNm), dKey = this.CAttExp(ats, 'key'), dHash = this.CAttExpList(ats, 'hash'), b = await this.CIter(srcE.childNodes);
                return b && async function FOR(ar, bR) {
                    let { r, sub } = PrepRng(ar, srcE, Q), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Nxt, iter = dOf() || E, sEnv = { env, oes }, pIter = async (iter) => {
                        ({ env, oes } = sEnv);
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
                                nwMap.set(key ?? {}, { item, key, hash, ix: ix++ });
                            }
                        }
                        finally {
                            EF();
                        }
                        let L = nwMap.size, x, nxR = r.ch, bf, iter2 = nwMap.values(), nxIR = iter2.next(), prIt, prR, k, E = () => {
                            while (nxR && !nwMap.has(k = nxR.key)) {
                                if (k != N)
                                    keyMap.delete(k);
                                nxR.erase(parN);
                                if (nxR.subs)
                                    nxR.rvars[0]._Subs.delete(nxR.subs);
                                nxR.pv = N;
                                nxR = nxR.nx;
                            }
                            bf = nxR?.FstOrNxt || bfor;
                        };
                        sub.parR = r;
                        while (!nxIR.done) {
                            E();
                            let { item, key, hash, ix } = nxIR.value, chR = keyMap.get(key), cr = !chR, chAr;
                            if (cr) {
                                sub.r = N;
                                sub.prR = prR;
                                sub.bfor = bf;
                                ({ r: chR, sub: chAr } = PrepRng(sub));
                                if (key != N)
                                    keyMap.set(key, chR);
                                chR.key = key;
                            }
                            else {
                                while (nxR != chR) {
                                    if (!chR.moving) {
                                        if ((x = nwMap.get(nxR.key).ix - ix) * x > L) {
                                            nxR.moving = T;
                                            nxR = nxR.nx;
                                            E();
                                            continue;
                                        }
                                        chR.pv.nx = chR.nx;
                                        if (chR.nx)
                                            chR.nx.pv = chR.pv;
                                    }
                                    for (let n of chR.Nodes())
                                        parN.insertBefore(n, bf);
                                    chR.moving = F;
                                    chR.nx = nxR;
                                    break;
                                }
                                nxR = chR.nx;
                                sub.r = chR;
                                chAr = PrepRng(sub).sub;
                                sub.parR = N;
                            }
                            chR.pv = prR;
                            chR.text = `${letNm}(${ix})`;
                            if (prR)
                                prR.nx = chR;
                            else
                                r.ch = chR;
                            prR = chR;
                            nxIR = iter2.next();
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
                                    vPv(prIt);
                                    vNx(nxIR.value?.item);
                                    await b(sub);
                                    if (bRe && !chR.subs)
                                        item.Subscribe(chR.subs = Subs(sub, b, chR.ch));
                                }
                                finally {
                                    EF();
                                }
                            }
                            prIt = item;
                        }
                        E();
                        if (prR)
                            prR.nx = N;
                        else
                            r.ch = N;
                    };
                    if (iter instanceof Promise)
                        r.rvars = [
                            RVAR(N, iter)
                                .Subscribe(r.subs =
                                ass(pIter, { T }))
                        ];
                    else
                        await pIter(iter);
                };
            });
        }
        else {
            let nm = ats.g('of', T, T).toUpperCase(), { S, dC } = this.CT.getCS(nm) ||
                thro(`Missing attribute [let]`);
            return this.Framed(async (SF) => {
                let vIx = this.LV(ixNm), DC = this.LCons([S]), b = await this.CChilds(srcE);
                return b && async function FOREACH_Slot(ar) {
                    let { tmps, env } = dC(), { EF, sub } = SF(ar), i = 0;
                    try {
                        for (let slotBldr of tmps) {
                            vIx(i++);
                            DC([
                                { nm, tmps: [slotBldr], env }
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
    async CComp(srcE, ats) {
        let bRec = ats.gB('recursive'), { hd, ws } = this, eStyles = ats.gB('encapsulate')
            && (this.hd = D.createDocumentFragment()).children, arr = Array.from(srcE.children), eSig = arr.shift() || thro('Missing signature(s)'), eTem = arr.pop(), t = /^TEMPLATE(S)?$/.exec(eTem?.tagName) || thro('Missing template(s)'), sigs = [], CDefs = [];
        for (let elm of /^SIGNATURES?$/.test(eSig.tagName)
            ? eSig.children
            : [eSig])
            sigs.push(new Signat(elm, this));
        try {
            var DC = bRec && this.LCons(sigs), ES = this.SS(), b = this.ErrH(await this.CIter(arr), srcE, T), mapS = new Map(mapI(sigs, S => [S.nm, S]));
            for (let [nm, elm, body] of t[1]
                ? mapI(eTem.children, elm => [elm.tagName, elm, elm])
                : [
                    [sigs[0].nm, eTem, eTem.content]
                ]) {
                CDefs.push({
                    nm,
                    tmps: [await this.CTempl(mapS.get(nm) || thro(`Template <${nm}> has no signature`), elm, F, U, body, eStyles)]
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
        DC || (DC = this.LCons(sigs));
        return async function COMP(ar) {
            DC(CDefs.map(C => ({ ...C, env })));
            await b?.(ar);
        };
    }
    CTempl(S, srcE, bSlot, ats, body = srcE, eStyles) {
        return this.Framed(async (SF) => {
            this.ws = this.rt = 1;
            let atts = ats || new Atts(srcE), lvars = S.Pams.map(({ mode, nm }) => {
                let lnm = atts.g(nm) ?? atts.g(mode + nm);
                return [nm, this.LV(lnm || (lnm === Q || !bSlot ? nm : N))];
            }), DC = this.LCons(S.Slots.values()), src = atts.g('src'), b = await (!src || body.children.length
                ? this.CIter(body.childNodes)
                : this.CSrc(src));
            ats || atts.None();
            return b && async function TEMPL(args, mSlots, env, ar) {
                if (!ar.r)
                    for (let { nm, pDf } of S.Pams)
                        if (pDf && args[nm] === U)
                            args[nm] = pDf();
                ro = F;
                let { sub, EF } = SF(ar);
                for (let [nm, lv] of lvars)
                    lv(args[nm]);
                DC(mapI(S.Slots.keys(), nm => ({ nm,
                    tmps: mSlots.get(nm) || E,
                    env
                })));
                if (eStyles) {
                    let { r: { n }, sub: s, cr } = PrepElm(sub, /^[A-Z].*-/.test(S.nm) ? S.nm : 'RHTML-' + S.nm), SR = s.parN = n.shadowRoot || n.attachShadow({ mode: 'open' });
                    if (cr)
                        for (let sn of eStyles)
                            SR.appendChild(sn.cloneNode(T));
                    sub = s;
                }
                await b(sub).finally(EF);
                pn = ar.parN;
            };
        }).catch(m => { throw ErrM(srcE, `<${S.nm}> template: ` + m); });
    }
    async CInstance(srcE, ats, { S, dC }) {
        await S.task;
        let { RP, CSlot, Slots } = S, gArgs = [], SBldrs = new Map(mapI(Slots, ([nm]) => [nm, []]));
        for (let { mode, nm, rq } of S.Pams)
            if (nm != RP) {
                let dG, dS;
                if (mode == '@') {
                    let ex = ats.g(mode + nm, rq);
                    dG = this.CExpr(ex, mode + nm);
                    dS = this.CTarget(ex);
                }
                else
                    dG = this.CPam(ats, nm, rq);
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
            SBldrs.get(CSlot.nm).push(await this.CTempl(CSlot, srcE, T, ats));
        if (RP) {
            let { bf, af } = this.CAtts(ats);
            bf.push(...af);
            gArgs.push({
                nm: RP,
                dG: () => ({ ms: bf, xs: bf.map(M => M.d()) })
            });
        }
        this.ws = 3;
        return async function INST(ar) {
            let { r, sub } = PrepRng(ar, srcE), sEnv = env, cdef = dC(), args = r.args || (r.args = NO());
            if (cdef)
                try {
                    ro = T;
                    for (let { nm, dG, dS } of gArgs)
                        if (dS)
                            (args[nm] || (args[nm] = RVAR(U, U, U, dS()))).v = dG();
                        else
                            args[nm] = dG();
                    env = cdef.env;
                    for (let tmpl of cdef.tmps)
                        await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {
                    env = sEnv;
                    ro = F;
                }
        };
    }
    async CHTML(srcE, ats, dTag, bUH) {
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
        let { bf, af } = this.CAtts(ats), b = await this.CChilds(srcE), { lscl, ndcl } = this;
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
    CAtts(ats) {
        let bf = [], af = [], m, ap = this.S.bAutoPointer, addM = (mt, nm, d, cu) => {
            let M = { mt, nm, d,
                cu: cu ||
                    (d.fx != N ? 1 : 3)
            };
            if (ap && mt == 7)
                M.ap = nm == 'click';
            if (mt == 6)
                M.fp = this.FP;
            (mt < 8 && nm != 'value' ? bf : af).push(M);
        };
        for (let [A, V] of ats)
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
                        : dV, (e && !p || h) && 1);
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
                        addM(7, m[2] ? 'change' : 'input', dSet, 1);
                }
                else {
                    if (V)
                        throw 'A rest parameter cannot have a value';
                    addM(8, A, this.CT.getLV(r));
                }
                ats.delete(A);
            }
        return { bf, af };
    }
    CText(text, nm) {
=======
const N = null, T = !0, F = !T, U = void 0, Q = '', E = [], W = window, D = document, L = location, G = self, US = "'use strict';", dflts = {
    bShowErrors: T,
    bAutoSubscribe: T,
    bAutoPointer: T,
    preformatted: E,
    storePrefix: "RVAR_",
    version: 1
}, P = new DOMParser, Ev = eval, ass = Object.assign, now = () => performance.now(), thro = (err) => { throw err; }, NO = () => new Object(null);
async function Bldrs(bs, ar) {
    for (let b of bs)
        if (await b(ar))
            break;
}
class Range {
    constructor(ar, n, text) {
        this.text = text;
        this.n = n;
        if (ar) {
            let { parR: p, prR: q } = ar;
            if (p && !p.n)
                this.parR = p;
            if (q)
                q.nx = this;
            else if (p)
                p.ch = this;
            ar.prR = this;
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
            ch.bD?.call(ch.n || par);
            ch.rvars?.forEach(rv => rv._Subs.delete(ch.subs));
            ch.erase(ch.parN ?? par);
            ch.aD?.call(ch.n || par);
            ch = ch.nx;
        }
    }
}
class Context {
    constructor(C, a) {
        ass(this, C || {
            d: 0, L: 0, M: 0, ct: Q,
            lvM: new Map, csM: new Map
        });
        if (a && C) {
            this.lvM = new Map(this.lvM);
            this.csM = new Map(this.csM);
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
        return this.getV(this.lvM.get(nm) || thro(`Unknown name '${nm}'`));
    }
    getCS(nm) {
        let SK = this.csM.get(nm);
        return SK && { S: SK.S, dC: this.getV(SK.k) };
    }
    max(C) {
        return ass(C.L > this.L ? C : this, {
            M: Math.min(this.M, C.M)
        });
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
class Signat {
    constructor(srcE, RC) {
        this.srcE = srcE;
        this.Pams = [];
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
                this.Pams.push({
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
            let c = T, mP = new Map(mapI(sig.Pams, p => [p.nm, p])), p;
            for (let { nm, rq } of this.Pams)
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
            (bImm ? this._Imm || (this._Imm = new Set()) : this._Subs).add(s);
        }
        return this;
    }
    Unsubscribe(s) {
        this._Imm?.delete(s);
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
        this._Imm?.forEach(s => s(this.v));
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
let env, pn, oes = { e: N, s: N }, Jobs = new Set(), hUpd, ro = F, upd = 0, nodeCnt = 0, start, NoTime = (prom) => {
    let t = now();
    return prom.finally(() => { start += now() - t; });
}, RUpd = () => {
    if (!env && !hUpd)
        hUpd = setTimeout(DoUpdate, 1);
};
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
        t._Subs = new Set;
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
                            (H = r[k] = new Hndlr).oes = oes;
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
function SetLVs(vars, data) {
    vars.forEach((v, i) => v(data[i]));
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
            env = r.env || (r.env = ass([nf ? e : e[0]], { cl: e.cl }));
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
    LV(nm) {
        if (nm = nm?.trim()) {
            try {
                if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm))
                    throw N;
                Ev(`let ${nm}=0`);
            }
            catch {
                throw `Invalid identifier '${nm}'`;
            }
            let { CT } = this, i = ++CT.L, vM = CT.lvM, p = vM.get(nm);
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
        return Array.from(split(varlist), nm => this.LV(nm));
    }
    LCons(listS) {
        let { CT } = this, { csM: cM, M, d } = CT;
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
            try {
                return await b(ass(ar, { parN: this.hd, bfor: N }));
            }
            finally {
                if (p = ar.prR)
                    p.parN = ar.parN;
                ass(ar, { parN, bfor });
            }
        };
    }
    async Compile(elm, nodes) {
        for (let tag of this.S.preformatted)
            this.sPRE.add(tag.toUpperCase());
        this.srcCnt = 0;
        let t0 = now(), b = (nodes
            ? await this.CIter(nodes)
            : await this.CElm(elm, T)) || dB;
        this.log(`Compiled ${this.srcCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
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
    CChilds(PN, nodes = PN.childNodes) {
        let ES = this.SS();
        return this.CIter(nodes).finally(ES);
    }
    async CIter(iter) {
        let { rt } = this, arr = Array.from(iter);
        while (rt && arr.length && reWS.test(arr[arr.length - 1]?.nodeValue))
            arr.pop();
        let bs = await this.CArr(arr, this.rt), l = bs.length;
        return !l ? N
            : l < 2 ? bs[0]
                : function Iter(ar) {
                    return Bldrs(bs, ar);
                };
    }
    async CArr(arr, rt, i = 0) {
        let bldrs = [], L = arr.length, rv;
        while (i < L) {
            let srcN = arr[i++], bl;
            this.rt = i == L && rt;
            switch (srcN.nodeType) {
                case 1:
                    this.srcCnt++;
                    if (rv = (bl = await this.CElm(srcN))?.auto)
                        try {
                            bldrs.push(bl);
                            var gv = this.CT.getLV(rv), s = this.cRvars[rv], bs = await this.CArr(arr, rt, this.cRvars[rv] = i);
                            bl = bs.length && this.cRvars[rv]
                                ? async function Auto(ar) {
                                    let { r, sub, cr } = PrepRng(ar);
                                    if (cr) {
                                        let rvar = gv(), s = rvar._Subs.size;
                                        await Bldrs(bs, sub);
                                        if (rvar._Subs.size == s)
                                            rvar.Subscribe(Subs(ar, Auto, r));
                                    }
                                    else if (r.upd != upd)
                                        await Bldrs(bs, sub);
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
                    this.srcCnt++;
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
            let tag = srcE.tagName, ats = new Atts(srcE), ga = [], bf = [], af = [], bl, bA, auto, constr = this.CT.getCS(tag), b, m, nm;
            for (let [at] of ats)
                if (m =
                    /^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(?:create|update|destroy|compile)+)$/
                        .exec(at))
                    if (m[1])
                        m[4] && tag != 'REACT'
                            || m[7] && tag == 'FOR'
                            || ga.push({
                                at,
                                m,
                                dV: m[5]
                                    ? this.CHandlr(ats.g(at), at)
                                    : m[8]
                                        ? this.CAttExp(ats, at)
                                        :
                                            this.CAttExpList(ats, at, T)
                            });
                    else {
                        let txt = ats.g(at);
                        if (/cr|d/.test(at))
                            (m[9] ? bf : af)
                                .push({
                                at,
                                txt,
                                C: /cr/.test(at),
                                U: /u/.test(at),
                                D: /y/.test(at),
                                h: m[9] && this.CHandlr(txt, at)
                            });
                        if (/m/.test(at))
                            Ev(`(function(){${txt}\n})`).call(srcE);
                    }
            if (constr)
                bl = await this.CInst(srcE, ats, constr);
            else
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            NoChilds(srcE);
                            let rv = ats.g('rvar'), t = '@value', twv = rv && ats.g(t), dGet = twv ? this.CExpr(twv, t) : this.CPam(ats, 'value'), bUpd = ats.gB('reacting') || ats.gB('updating') || twv, dSet = twv && this.CTarget(twv), dUpd = rv && this.CAttExp(ats, 'updates'), dSto = rv && this.CAttExp(ats, 'store'), dSNm = dSto && this.CPam(ats, 'storename'), vLet = this.LV(rv || ats.g('let') || ats.g('var', T)), vGet = rv && this.CT.getLV(rv), onMod = rv && this.CPam(ats, 'onmodified');
                            auto = rv && ats.gB('auto', this.S.bAutoSubscribe) && !onMod && rv;
                            bA = async function DEF(ar, bR) {
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
                        bl = await this.CCase(srcE, ats);
                        break;
                    case 'FOR':
                        bl = await this.CFor(srcE, ats);
                        break;
                    case 'MODULE':
                        ats.g('id');
                        break;
                    case 'INCLUDE':
                        bl = await this.CIncl(srcE, ats, T);
                        break;
                    case 'IMPORT':
                        {
                            let src = ats.g('src', T), bIncl = ats.gB('include'), bAsync = ats.gB('async'), lvars = this.LVars(ats.g('defines')), imps = Array.from(mapI(srcE.children, ch => new Signat(ch, this))), DC = this.LCons(imps), cTask = OMods.get(src);
                            if (!cTask) {
                                let C = new RComp(this, this.GetP(src), { bSubf: T }, new Context);
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
                            bA = async function IMPORT(ar) {
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
                            let { ws, rt } = this, b = await this.CUncN(srcE), dSrc = !b && this.CPam(ats, 'srctext'), dO = this.CPam(ats, "onç"), s = { bSubf: 2, bTiming: this.S.bTiming };
                            bl = async function RHTML(ar) {
                                let { r, sub } = PrepElm(ar, 'r-html'), src = b ? (await b(sub)).innerText : dSrc?.();
                                if (src != r.src) {
                                    let sv = env, C = ass(new RComp(N, L.origin + DL.basepath, s), { ws, rt }), parN = C.hd = r.n.shadowRoot || r.n.attachShadow({ mode: 'open' }), parR = r.pR || (r.pR = new Range(N, N, tag)), tmp = D.createElement(tag);
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
                                        parN.appendChild(crErrN(e));
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
                        bA = await this.CScript(srcE, ats);
                        break;
                    case 'COMPONENT':
                        bA = await this.CComp(srcE, ats);
                        break;
                    case 'DOCUMENT':
                        {
                            let vDoc = this.LV(ats.g('name', T)), bEncaps = ats.gB('encapsulate'), PC = this, RC = new RComp(this), vPams = RC.LVars(ats.g('params')), vWin = RC.LV(ats.g('window', F, F, T)), H = RC.hd = D.createDocumentFragment(), b = await RC.CChilds(srcE);
                            bA = async function DOCUMENT(ar) {
                                if (!ar.r) {
                                    let { doc, hd } = PC, docEnv = env, wins = new Set();
                                    vDoc({
                                        async render(w, cr, args) {
                                            let s = env, Cdoc = RC.doc = w.document;
                                            RC.hd = Cdoc.head;
                                            env = docEnv;
                                            SetLVs(vPams, args);
                                            vWin(w);
                                            try {
                                                if (cr) {
                                                    if (!bEncaps)
                                                        for (let SSh of hd.styleSheets || doc.styleSheets) {
                                                            let DSh = Cdoc.head.appendChild(D.createElement('style')).sheet;
                                                            for (let rule of SSh.cssRules)
                                                                DSh.insertRule(rule.cssText);
                                                        }
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
                                            let f = doc.createElement('iframe');
                                            f.hidden = T;
                                            doc.body.appendChild(f);
                                            await this.render(f.contentWindow, T, args);
                                            f.contentWindow.print();
                                            f.remove();
                                        },
                                        closeAll: () => wins.forEach(w => w.close())
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
                            let src = ats.g('src'), sc = ats.g('scope'), nm, { lscl: l, hd } = this;
                            if (sc) {
                                /^local$/i.test(sc) || thro('Invalid scope');
                                nm = `\uFFFE${iStyle++}`;
                                this.lscl = [...l, nm];
                                this.rActs.push(() => this.lscl = l);
                            }
                            (src ? this.FetchText(src) : Promise.resolve(srcE.innerText))
                                .then(txt => {
                                if (src || nm)
                                    srcE.innerHTML = AddC(txt, nm);
                                hd.appendChild(srcE);
                            });
                            ats.clear();
                        }
                        break;
                    case 'RSTYLE': {
                        let s = [this.S.bDollarRequired, this.rIS, this.ws], sc = ats.g('scope'), { bf, af } = this.CAtts(ats), i;
                        try {
                            this.S.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = 1;
                            let b = await (sc ?
                                (/^local$/i.test(sc) || thro('Invalid scope')
                                    , (i = this.ndcl++)
                                    , this.rActs.push(() => this.ndcl--)
                                    , this.CUncN(srcE, ats))
                                : this.CIncl(srcE, ats));
                            bl = b && async function RSTYLE(ar) {
                                let { r, cr, sub } = PrepElm(ar, 'STYLE'), k = ApplyMods(r, cr, bf);
                                if (sc) {
                                    let txt = (await b(ar)).innerText, nm = r.cn || (r.cn = `\uFFFE${iStyle++}`);
                                    if (txt != r.tx)
                                        r.n.innerHTML = AddC(r.tx = txt, nm);
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
                        bl = await this.CHTML(srcE, ats, this.CPam(ats, 'tagname', T));
                        this.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dN = this.CPam(ats, 'name', T), dV = this.CPam(ats, 'value', T);
                        bl = async function ATTRIB(ar) {
                            let r = PrepRng(ar, srcE).r, n0 = r.v, nm = r.v = dN();
                            if (n0 && nm != n0)
                                pn.removeAttribute(n0);
                            if (nm)
                                pn.setAttribute(nm, dV());
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
                        bl = await this.CHTML(srcE, ats, U, bUH);
                }
            if (!bUH)
                ats.None();
            nm = (bl || (bl = bA || (bA = dB))).name;
            if (bf.length || af.length) {
                for (let g of af)
                    g.h = this.CHandlr(g.txt, g.at);
                let b = bl;
                bl = async function Pseu(ar, bR) {
                    let { r, sub, cr } = PrepRng(ar, srcE), sr = sub.r || T, bD = ph(bf, 'bU', sr != T && sr.n || pn);
                    await b(sub, bR);
                    let rng = (cr
                        ? sub.prR
                        : sub.r != sr && sr)
                        || PrepRng(sub).r, aD = ph(af, 'aU', rng.n || pn);
                    if (cr)
                        ass(rng, { bD, aD });
                    function ph(hh, U, elm) {
                        if (cr) {
                            for (let g of hh) {
                                let h = g.h();
                                if (g.C)
                                    h.call(elm);
                                if (g.U)
                                    r[U] = h;
                                if (g.D)
                                    var D = h;
                            }
                            return D;
                        }
                        r[U]?.call(elm);
                    }
                };
            }
            for (let { at, m, dV } of this.S.version ? ga : ga.reverse()) {
                let b = bl, es = m[6] ? 'e' : 's';
                if (m[2]) {
                    let R = async (ar, bR) => {
                        let { r, sub } = PrepRng(ar, srcE, at);
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
                                throw `This is not an RVAR\nat '${at}'`;
                            }
                    };
                }
                else
                    bl =
                        m[5]
                            ? async function SetOnES(ar, bR) {
                                let s = oes, { sub, r } = PrepRng(ar, srcE, at);
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
                                    let { sub, r, cr } = PrepRng(ar, srcE, at), ph = r.v;
                                    r.v = dV();
                                    if (cr || r.v.some((hash, i) => hash !== ph[i]))
                                        return b(sub, bR);
                                }
                                : m[8]
                                    ? function hIf(ar, bR) {
                                        let c = dV(), p = PrepRng(ar, srcE, at, 1, !c);
                                        if (c)
                                            return b(p.sub, bR);
                                    }
                                    :
                                        function renew(sub, bR) {
                                            return b(PrepRng(sub, srcE, at, 2).sub, bR);
                                        };
            }
            return bl != dB && ass(this.ErrH(bl, srcE, !!bA), { auto, nm });
        }
        catch (m) {
            throw ErrM(srcE, m);
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
                let msg = srcN instanceof HTMLElement ? ErrM(srcN, m, 45) : m, e = oes.e;
                if (this.S.bAbortOnError)
                    throw msg;
                this.log(msg);
                e ? e(m)
                    : this.S.bShowErrors ?
                        (r || {}).eN = ar.parN.insertBefore(crErrN(msg), ar.r?.FstOrNxt)
                        : U;
                return bA;
            }
        });
    }
    CIncl(srcE, ats, bReq) {
        let src = ats?.g('src', bReq);
        if (!src || srcE.children.length || srcE.textContent.trim())
            return this.CChilds(srcE);
        return this.Framed(async (SF) => {
            let C = new RComp(this, this.GetP(src), { bSubf: T }), task = this.fetchM(src)
                .then(txt => C.Compile(N, txt))
                .catch(e => { alert(e); throw e; });
            return async function INCLUDE(ar) {
                let { sub, EF } = SF(ar);
                await (await NoTime(task))(sub).finally(EF);
            };
        });
    }
    async CUncN(srcE, ats) {
        let b = await this.CIncl(srcE, ats);
        return b && (async (ar) => {
            let { r, sub } = PrepRng(ar, srcE), p = sub.parN = r.p || (r.p = D.createElement(srcE.tagName));
            r.parN = F;
            sub.bfor = N;
            await b(sub);
            return p;
        });
    }
    async CScript(srcE, ats) {
        let { type, text, defer, async } = srcE, src = ats.g('src'), defs = ats.g('defines') || '', m = /^\s*(((text|application)\/javascript|)|(module)|(otoreact)(\/((local)|(static)|global)|(.*?)))\s*(;\s*type\s*=\s*(")?module\12)?\s*$|/i.exec(type), bU = ats.gB('updating'), { ct } = this.CT, lvars = m[8] && this.LVars(defs), ex;
        ats.clear();
        if (m[5] && (!m[10] || thro("Invalid script type"))
            || (m[2] != N || m[4]) && this.S.bSubf) {
            if (m[8]) {
                let prom = (async () => Ev(US + `(function([${ct}]){{\n${src ? await this.FetchText(src) : text}\nreturn{${defs}}}})`))();
                ex = async () => (await prom)(env);
            }
            else if (m[4] || m[11]) {
                let pArr = (src
                    ? import(this.GetURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => p1 + this.GetURL(p2) + p3)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src)));
                ex = () => pArr;
            }
            else {
                let pTxt = (async () => `${m[5] ? US : Q}${src ? await this.FetchText(src) : text}\n;({${defs}})`)(), V;
                ex = async () => V || (V = Ev(await pTxt));
                if (src && async)
                    ex();
                else if (!m[5] && !defer)
                    await ex();
            }
            return async function SCRIPT(ar) {
                if (!ar.r || bU) {
                    let obj = await ex();
                    if (lvars)
                        lvars.forEach(lv => lv(obj[lv.nm]));
                    else
                        ass(G, obj);
                }
            };
        }
    }
    async CCase(srcE, ats) {
        let bH = ats.gB('hiding'), dV = this.CAttExp(ats, 'value'), cases = [], body = [], bE;
        for (let n of srcE.childNodes) {
            if (n instanceof HTMLElement)
                switch (n.tagName) {
                    case 'THEN':
                        var bThen = T;
                        new Atts(n).None();
                        cases.push({ n, ats });
                        continue;
                    case 'ELSE':
                        if (bE)
                            throw "Double ELSE";
                        bE = T;
                    case 'WHEN':
                        cases.push({ n, ats: new Atts(n) });
                        continue;
                }
            body.push(n);
        }
        if (srcE.tagName == 'IF' && !bThen)
            cases.unshift({ n: srcE, ats, body });
        let caseList = [], { ws, rt, CT } = this, postCT = CT, postWs = 0;
        for (let { n, ats, body } of cases) {
            let ES = ass(this, { ws, rt, CT: new Context(CT) })
                .SS();
            try {
                let cond, not = F, patt, p;
                switch (n.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp(ats, 'cond');
                        not = ats.gB('not');
                        patt = dV && ((p = ats.g('match') ?? ats.g('pattern')) != N
                            ? this.CPatt(p)
                            : (p = ats.g('urlmatch')) != N
                                ? this.CPatt(p, T)
                                : (p = ats.g('regmatch') || ats.g('regexp')) != N
                                    ? { RE: new RegExp(p, 'i'),
                                        lvars: this.LVars(ats.g('captures'))
                                    }
                                    : N);
                        if (patt?.lvars.length && (bH || not))
                            throw `Pattern capturing can't be combined with 'hiding' or 'not'`;
                    case 'ELSE':
                        caseList.push({
                            cond, not, patt,
                            b: await this.CChilds(n, body) || dB,
                            n
                        });
                        ats.None();
                        postWs = Math.max(postWs, this.ws);
                        postCT = postCT.max(this.CT);
                }
            }
            catch (m) {
                throw n.tagName == 'IF' ? m : ErrM(n, m);
            }
            finally {
                ES();
            }
        }
        this.ws = !bE && ws > postWs ? ws : postWs;
        this.CT = postCT;
        return caseList.length && async function CASE(ar, bR) {
            let val = dV?.(), RRE, cAlt;
            try {
                for (var alt of caseList)
                    if (!((!alt.cond || alt.cond())
                        && (!alt.patt || val != N && (RRE = alt.patt.RE.exec(val)))) == alt.not) {
                        cAlt = alt;
                        break;
                    }
            }
            catch (m) {
                throw alt.n.tagName == 'IF' ? m : ErrM(alt.n, m);
            }
            finally {
                if (bH) {
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
                                SetLVs(cAlt.patt.lvars, cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE);
                        await cAlt.b(sub);
                    }
                }
            }
        };
    }
    CFor(srcE, ats) {
        let letNm = ats.g('let'), ixNm = ats.g('index', F, F, T);
        this.rt = F;
        if (letNm != N) {
            let dOf = this.CAttExp(ats, 'of', T), pvNm = ats.g('previous', F, F, T), nxNm = ats.g('next', F, F, T), dUpd = this.CAttExp(ats, 'updates'), bRe = ats.gB('reacting') || ats.gB('reactive') || dUpd;
            return this.Framed(async (SF) => {
                let vLet = this.LV(letNm), vIx = this.LV(ixNm), vPv = this.LV(pvNm), vNx = this.LV(nxNm), dKey = this.CAttExp(ats, 'key'), dHash = this.CAttExpList(ats, 'hash'), b = await this.CIter(srcE.childNodes);
                return b && async function FOR(ar, bR) {
                    let { r, sub } = PrepRng(ar, srcE, Q), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Nxt, iter = dOf() || E, sEnv = { env, oes }, pIter = async (iter) => {
                        ({ env, oes } = sEnv);
                        if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                            throw `[of] Value (${iter}) is not iterable`;
                        let keyMap = r.v || (r.v = new Map), nwMap = new Map(), ix = 0, { EF } = SF(N, {});
                        try {
                            for await (let item of iter) {
                                vLet(item);
                                vIx(ix);
                                let hash = dHash?.(), key = dKey?.() ?? hash?.[0];
                                if (key != N && nwMap.has(key))
                                    throw `Duplicate key '${key}'`;
                                nwMap.set(key ?? {}, { item, key, hash, ix: ix++ });
                            }
                        }
                        finally {
                            EF();
                        }
                        let L = nwMap.size, x, nxR = r.ch, bf, iter2 = nwMap.values(), nxIR = iter2.next(), prIt, prR, k, E = () => {
                            while (nxR && !nwMap.has(k = nxR.key)) {
                                if (k != N)
                                    keyMap.delete(k);
                                nxR.erase(parN);
                                if (nxR.subs)
                                    nxR.rvars[0]._Subs.delete(nxR.subs);
                                nxR.pv = N;
                                nxR = nxR.nx;
                            }
                            bf = nxR?.FstOrNxt || bfor;
                        };
                        sub.parR = r;
                        while (!nxIR.done) {
                            E();
                            let { item, key, hash, ix } = nxIR.value, chR = keyMap.get(key), cr = !chR, chAr;
                            if (cr) {
                                sub.r = N;
                                sub.prR = prR;
                                sub.bfor = bf;
                                ({ r: chR, sub: chAr } = PrepRng(sub));
                                if (key != N)
                                    keyMap.set(key, chR);
                                chR.key = key;
                            }
                            else {
                                while (nxR != chR) {
                                    if (!chR.moving) {
                                        if ((x = nwMap.get(nxR.key).ix - ix) * x > L) {
                                            nxR.moving = T;
                                            nxR = nxR.nx;
                                            E();
                                            continue;
                                        }
                                        chR.pv.nx = chR.nx;
                                        if (chR.nx)
                                            chR.nx.pv = chR.pv;
                                    }
                                    for (let n of chR.Nodes())
                                        parN.insertBefore(n, bf);
                                    chR.moving = F;
                                    chR.nx = nxR;
                                    break;
                                }
                                nxR = chR.nx;
                                sub.r = chR;
                                chAr = PrepRng(sub).sub;
                                sub.parR = N;
                            }
                            chR.pv = prR;
                            chR.text = `${letNm}(${ix})`;
                            if (prR)
                                prR.nx = chR;
                            else
                                r.ch = chR;
                            prR = chR;
                            nxIR = iter2.next();
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
                                    vPv(prIt);
                                    vNx(nxIR.value?.item);
                                    await b(sub);
                                    if (bRe && !chR.subs)
                                        item.Subscribe(chR.subs = Subs(sub, b, chR.ch));
                                }
                                finally {
                                    EF();
                                }
                            }
                            prIt = item;
                        }
                        E();
                        if (prR)
                            prR.nx = N;
                        else
                            r.ch = N;
                    };
                    if (iter instanceof Promise)
                        r.rvars = [
                            RVAR(N, iter)
                                .Subscribe(r.subs =
                                ass(pIter, { T }))
                        ];
                    else
                        await pIter(iter);
                };
            });
        }
        else {
            let nm = ats.g('of', T, T).toUpperCase(), { S, dC } = this.CT.getCS(nm) ||
                thro(`Missing attribute [let]`);
            return this.Framed(async (SF) => {
                let vIx = this.LV(ixNm), DC = this.LCons([S]), b = await this.CChilds(srcE);
                return b && async function FOREACH_Slot(ar) {
                    let { tmps, env } = dC(), { EF, sub } = SF(ar), i = 0;
                    try {
                        for (let slotBldr of tmps) {
                            vIx(i++);
                            DC([
                                { nm, tmps: [slotBldr], env }
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
    async CComp(srcE, ats) {
        let bRec = ats.gB('recursive'), { hd, ws } = this, eStyles = ats.gB('encapsulate')
            && (this.hd = D.createDocumentFragment()).children, arr = Array.from(srcE.children), eSig = arr.shift() || thro('Missing signature(s)'), eTem = arr.pop(), t = /^TEMPLATE(S)?$/.exec(eTem?.tagName) || thro('Missing template(s)'), sigs = [], CDefs = [];
        for (let elm of /^SIGNATURES?$/.test(eSig.tagName)
            ? eSig.children
            : [eSig])
            sigs.push(new Signat(elm, this));
        try {
            var DC = bRec && this.LCons(sigs), ES = this.SS(), b = this.ErrH(await this.CIter(arr), srcE, T), mapS = new Map(mapI(sigs, S => [S.nm, S]));
            for (let [nm, elm, body] of t[1]
                ? mapI(eTem.children, elm => [elm.tagName, elm, elm])
                : [
                    [sigs[0].nm, eTem, eTem.content]
                ]) {
                CDefs.push({
                    nm,
                    tmps: [await this.CTempl(mapS.get(nm) || thro(`Template <${nm}> has no signature`), elm, F, U, body, eStyles)]
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
        DC || (DC = this.LCons(sigs));
        return async function COMP(ar) {
            DC(CDefs.map(C => ({ ...C, env })));
            await b?.(ar);
        };
    }
    CTempl(S, srcE, bSlot, ats, body = srcE, eStyles) {
        return this.Framed(async (SF) => {
            this.ws = this.rt = 1;
            let myAtts = ats || new Atts(srcE), lvars = S.Pams.map(({ mode, nm }) => {
                let lnm = myAtts.g(nm) ?? myAtts.g(mode + nm);
                return [nm, this.LV(lnm || (lnm === Q || !bSlot ? nm : N))];
            }), DC = (!ats && myAtts.None(),
                this.LCons(S.Slots.values())), b = await this.CIter(body.childNodes), tag = /^[A-Z].*-/.test(S.nm) ? S.nm : 'rhtml-' + S.nm;
            return b && async function TEMPL(args, mSlots, env, ar) {
                if (!ar.r)
                    for (let { nm, pDf } of S.Pams)
                        if (pDf && args[nm] === U)
                            args[nm] = pDf();
                ro = F;
                let { sub, EF } = SF(ar);
                for (let [nm, lv] of lvars)
                    lv(args[nm]);
                DC(mapI(S.Slots.keys(), nm => ({ nm,
                    tmps: mSlots.get(nm) || E,
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
        }).catch(m => { throw `<${S.nm}> template: ` + m; });
    }
    async CInst(srcE, ats, { S, dC }) {
        await S.task;
        let { RP, CSlot, Slots } = S, gArgs = [], SBldrs = new Map(mapI(Slots, ([nm]) => [nm, []]));
        for (let { mode, nm, rq } of S.Pams)
            if (nm != RP) {
                let dG, dS;
                if (mode == '@') {
                    let ex = ats.g(mode + nm, rq);
                    dG = this.CExpr(ex, mode + nm);
                    dS = this.CTarget(ex);
                }
                else
                    dG = this.CPam(ats, nm, rq);
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
            SBldrs.get(CSlot.nm).push(await this.CTempl(CSlot, srcE, T, ats));
        if (RP) {
            let { bf, af } = this.CAtts(ats);
            bf.push(...af);
            gArgs.push({
                nm: RP,
                dG: () => ({ ms: bf, xs: bf.map(M => M.d()) })
            });
        }
        this.ws = 3;
        return async function INST(ar) {
            let { r, sub } = PrepRng(ar, srcE), sEnv = env, cdef = dC(), args = r.args || (r.args = NO());
            if (cdef)
                try {
                    ro = T;
                    for (let { nm, dG, dS } of gArgs)
                        if (dS)
                            (args[nm] || (args[nm] = RVAR(U, U, U, dS()))).v = dG();
                        else
                            args[nm] = dG();
                    env = cdef.env;
                    for (let tmpl of cdef.tmps)
                        await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {
                    env = sEnv;
                    ro = F;
                }
        };
    }
    async CHTML(srcE, ats, dTag, bUH) {
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
        let { bf, af } = this.CAtts(ats), b = await this.CChilds(srcE), { lscl, ndcl } = this;
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
    CAtts(ats) {
        let bf = [], af = [], m, ap = this.S.bAutoPointer, addM = (mt, nm, d, cu) => {
            let M = { mt, nm, d,
                cu: cu ||
                    (d.fx != N ? 1 : 3)
            };
            if (ap && mt == 7)
                M.ap = nm == 'click';
            if (mt == 6)
                M.fp = this.FP;
            (mt < 8 && nm != 'value' ? bf : af).push(M);
        };
        for (let [A, V] of ats)
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
                        : dV, (e && !p || h) && 1);
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
                        addM(7, m[2] ? 'change' : 'input', dSet, 1);
                }
                else {
                    if (V)
                        throw 'A rest parameter cannot have a value';
                    addM(8, A, this.CT.getLV(r));
                }
                ats.delete(A);
            }
        return { bf, af };
    }
    CText(text, nm) {
>>>>>>> 306c0af66f506d628970cfbf7697b3bfcf026b97
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
                        ? (lvars.push(this.LV(m[1])), '(.*?)')
                        : m[0] == '?' ? '.'
                            : m[0] == '*' ? '.*'
                                : m[2] ? m[2]
                                    : m[0]);
        }
        return { lvars, RE: new RegExp(`^${reg}$`, 'i'), url };
    }
    CPam(ats, at, bReq) {
        let txt = ats.g(at);
        return (txt == N ? this.CAttExp(ats, at, bReq)
            : /^on/.test(at) ? this.CHandlr(txt, at)
                : this.CText(txt, at));
    }
    CAttExp(ats, at, bReq) {
        return this.CExpr(ats.g(at, bReq, T), '#' + at, U);
    }
    CTarget(LHS) {
        return this.CRout(`(${LHS})=$`, '$', `\nin assigment target "${LHS}"`);
    }
    CHandlr(txt, nm) {
        return /^#/.test(nm) ?
            this.CExpr(txt, nm, txt)
            : this.CRout(txt, 'event', `\nat ${nm}="${Abbr(txt)}"`);
    }
    CRout(txt, x, E) {
        try {
            let ct = this.gsc(txt), C = Ev(`${US}(function(${x},${ct}){${txt}\n})`);
            return ct ?
                (e = env) => function ($) {
                    try {
                        return C.call(this, $, e);
                    }
                    catch (m) {
                        throw m + E;
                    }
                }
                : () => function ($) {
                    try {
                        return C.call(this, $);
                    }
                    catch (m) {
                        throw m + E;
                    }
                };
        }
        catch (m) {
            throw m + E;
        }
    }
    CExpr(e, nm, src = e, dl = '""') {
        if (e == N)
            return e;
        if (!/\S/.test(e))
            throw `${nm}: Empty expression`;
        try {
            var E = '\nat ' + (nm ? `${nm}=` : Q) + dl[0] + Abbr(src) + dl[1], f = Ev(`${US}(function(${this.gsc(e)}){return(${e}\n)})`);
            return () => {
                try {
                    return f.call(pn, env);
                }
                catch (m) {
                    throw m + E;
                }
            };
        }
        catch (m) {
            throw m + E;
        }
    }
    CAttExpList(ats, attNm, bReacts) {
        let L = ats.g(attNm, F, T);
        if (L == N)
            return N;
        if (bReacts)
            for (let nm of split(L))
                this.cRvars[nm] = N;
        return this.CExpr(`[${L}\n]`, attNm);
    }
    gsc(exp) {
        let { ct, lvM, d } = this.CT, n = d + 1;
        for (let m of exp.matchAll(/\b[A-Z_$][A-Z0-9_$]*\b/gi)) {
            let k = lvM.get(m[0]);
            if (k?.d < n)
                n = k.d;
        }
        if (n > d)
            return Q;
        let p = d - n, q = p;
        while (n--)
            q = ct.indexOf(']', q) + 1;
        return `[${ct.slice(0, p)}${ct.slice(q)}]`;
    }
    GetURL(src) {
        return new URL(src, this.FP).href;
    }
    GetP(src) {
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
                return [...head.childNodes, ...body.childNodes];
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
            throw `Missing attribute '` + nm + `'`;
        return bI && v == Q ? nm : v;
    }
    gB(nm, df = F) {
        let v = this.g(nm), m = /^((false|no)|true|yes)?$/i.exec(v);
        return v == N ? df
            : m ? !m[2]
                : thro(`@${nm}: invalid value`);
    }
    None() {
        super.delete('hidden');
        if (this.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}
const reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|[OU]L|P|TABLE|T[RHD]|PRE)$/, reInline = /^(BUTTON|INPUT|IMG|SELECT|TEXTAREA)$/, reWS = /^[ \t\n\r]*$/, AddC = (txt, nm) => nm ? txt.replaceAll(/{(?:{.*?}|.)*?}|@[msd].*?{|@[^{;]*|(\w|[-.#:()\u00A0-\uFFFF]|\[(?:"(?:\\.|.)*?"|'(?:\\.|.)*?'|.)*?\]|\\[0-9A-F]+\w*|\\.|"(?:\\.|.)*?"|'(?:\\.|.)*?')+/gsi, (m, p) => p ? `${m}.${nm}` : m)
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
}, Abbr = (s, m = 65) => s.length > m ?
    s.slice(0, m - 3) + "..."
    : s, mapNm = (m, o) => m.set(o.nm, o), mapSet = (m, nm, v) => v != N ? m.set(nm, v) : m.delete(nm), ErrM = (elm, e = Q, maxL) => e + `\nat ${Abbr(/<[^]*?(?=>)/.exec(elm.outerHTML)[0], maxL)}>`, crErrN = (m) => ass(D.createElement('div'), { style: 'color:crimson;font-family:sans-serif;font-size:10pt',
    innerText: m }), NoChilds = (srcE) => {
    for (let n of srcE.childNodes)
        if (n.nodeType == 1
            || n.nodeType == 3
                && !reWS.test(n.nodeValue))
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
}, S2Hash = () => L.hash && setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6);
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
    try {
        let rp = await fetch(input, init);
        if (!rp.ok)
            throw `Status ${rp.status} ${rp.statusText}`;
        return rp;
    }
    catch (e) {
        throw `${init?.method || 'GET'} ${input}: ` + e;
    }
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
            S2Hash();
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
let R, DL = new DocLoc, reroute = arg => {
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
export async function RCompile(srcN, setts) {
    if (srcN.isConnected && !srcN.b)
        try {
            srcN.b = T;
            let m = L.href.match(`^.*(${setts?.basePattern || '/'})`), C = new RComp(N, L.origin + (DL.basepath = m ? new URL(m[0]).pathname.replace(/[^/]*$/, Q) : Q), setts);
            await C.Compile(srcN);
            srcN.innerHTML = Q;
            Jobs.add({ Exec: () => C.Build({
                    parN: srcN.parentElement,
                    srcN,
                    bfor: srcN
                }).then(S2Hash)
            });
            DoUpdate();
        }
        catch (e) {
            alert(`OtoReact compile error: ` + Abbr(e, 1000));
        }
}
export async function DoUpdate() {
    hUpd = N;
    if (Jobs.size && !env) {
        env = E;
        nodeCnt = 0;
        let u0 = upd;
        start = now();
        while (Jobs.size) {
            let J = Jobs;
            Jobs = new Set;
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
setTimeout(() => {
    for (let src of D.querySelectorAll('*[rhtml],*[type=RHTML]')) {
        let o = src.getAttribute('rhtml');
        RCompile(src, o && Ev(`({${o}})`));
    }
}, 0);
