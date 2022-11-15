const U = undefined, N = null, T = true, F = false, E = [], W = window, D = document, L = location, G = W.globalThis || (W.globalThis = W.self), defaults = {
    bTiming: F,
    bAbortOnError: F,
    bShowErrors: T,
    bSubfile: F,
    basePattern: '/',
    preformatted: E,
    bNoGlobals: F,
    bDollarRequired: F,
    bSetPointer: T,
    bKeepWhiteSpace: F,
    bKeepComments: F,
    storePrefix: "RVAR_"
}, parser = new DOMParser(), gEval = eval, ass = Object.assign, now = () => performance.now(), dU = () => U, dumB = async (_) => { }, childWins = new Set(), RModules = new Map();
class Range {
    constructor(ar, node, text) {
        this.text = text;
        this.node = node;
        if (ar) {
            let p = ar.parR, q = ar.prevR;
            if (p && !p.node)
                this.parR = p;
            if (q)
                q.next = this;
            else if (p)
                p.child = this;
            ar.prevR = this;
        }
    }
    toString() { return this.text || this.node?.nodeName; }
    get First() {
        let f;
        if (f = this.node)
            return f;
        let c = this.child;
        while (c) {
            if (f = c.First)
                return f;
            c = c.next;
        }
    }
    get Next() {
        let r = this, n, p;
        do {
            p = r.parR;
            while (r = r.next)
                if (n = r.First)
                    return n;
        } while (r = p);
    }
    get FirstOrNext() {
        return this.First || this.Next;
    }
    Nodes() {
        return (function* Nodes(r) {
            let c;
            if (r.node)
                yield r.node;
            else if (c = r.child)
                do {
                    yield* Nodes(c);
                } while (c = c.next);
        })(this);
    }
    erase(par) {
        let { node, child: ch } = this;
        if (node && par) {
            par.removeChild(node);
            par = N;
        }
        this.child = N;
        while (ch) {
            if (ch.bfDest)
                ch.bfDest.call(ch.node || par);
            ch.erase(ch.parN || par);
            if (ch.rvars)
                for (let rv of ch.rvars)
                    rv._Subs.delete(ch.subs);
            if (ch.onDest)
                ch.onDest.call(ch.node || par);
            ch = ch.next;
        }
    }
}
function PrepArea(srcE, ar, text = '', nWipe, res) {
    let { parN, r } = ar, sub = { parN, r: N }, bCr = !r;
    if (bCr) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        if (srcE)
            text = srcE.tagName + (text && ' ') + text;
        (r = sub.parR = new Range(ar, N, text)).res = res;
    }
    else {
        sub.r = r.child;
        ar.r = r.next;
        if (bCr = nWipe && (nWipe > 1 || res != r.res)) {
            r.res = res;
            (sub.parR = r).erase(parN);
            sub.r = N;
            sub.bfor = r.Next;
        }
    }
    return { r, sub, bCr };
}
function PrepElm(srcE, ar, tag = srcE.tagName) {
    let r = ar.r, bCr = !r;
    if (bCr)
        r = new Range(ar, ar.srcN == srcE
            ? (srcE.innerHTML = "", srcE)
            : ar.parN.insertBefore(D.createElement(tag), ar.bfor));
    else
        ar.r = r.next;
    return {
        r,
        chAr: {
            parN: r.node,
            r: r.child,
            bfor: N,
            parR: r
        },
        bCr
    };
}
function PrepCharData(ar, content, bComm) {
    let r = ar.r;
    if (!r)
        new Range(ar, ar.parN.insertBefore(bComm ? D.createComment(content) : D.createTextNode(content), ar.bfor));
    else {
        r.node.data = content;
        ar.r = r.next;
    }
}
export async function RCompile(elm = D.body, settings) {
    try {
        let { basePattern } = R.Settings = { ...defaults, ...settings }, m = L.href.match(`^.*(${basePattern})`);
        R.FilePath = L.origin + (DL.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : '');
        await R.Compile(elm);
        start = now();
        nodeCnt = 0;
        let ar = { parN: elm.parentElement, srcN: elm, r: N };
        await R.Build(ar);
        W.addEventListener('pagehide', () => childWins.forEach(w => w.close()));
        R.log(`Built ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (e) {
        alert(`OtoReact error: ` + LAbbr(e));
    }
}
function NewEnv() {
    return [];
}
function CloneEnv(e = env) {
    return ass([], e);
}
function assEnv(target, source) {
    ass(target, source);
}
class Signature {
    constructor(srcElm) {
        this.srcElm = srcElm;
        this.Params = [];
        this.Slots = new Map();
        this.nm = srcElm.tagName;
    }
    IsCompat(sig) {
        if (!sig)
            return;
        let c = T, mParams = new Map(mapI(sig.Params, p => [p.nm, !!p.pDflt]));
        for (let { nm, pDflt } of this.Params)
            if (mParams.has(nm)) {
                c && (c = !pDflt || mParams.get(nm));
                mParams.delete(nm);
            }
            else
                c = F;
        for (let pDflt of mParams.values())
            c && (c = pDflt);
        for (let [nm, slotSig] of this.Slots)
            c && (c = sig.Slots.get(nm)?.IsCompat(slotSig));
        return c;
    }
}
class _RVAR {
    constructor(name, initial, store, storeName) {
        this.name = name;
        this.store = store;
        this.storeName = storeName;
        this.v = U;
        this._Subs = new Set();
        if (name)
            G[name] = this;
        let s = store && store.getItem(this._sNm), t = initial;
        if (s)
            try {
                this.v = JSON.parse(s);
                return;
            }
            catch { }
        t instanceof Promise ?
            t.then(v => this.V = v, onerr)
            : (this.v = t);
    }
    get _sNm() {
        return this.storeName || R.Settings.storePrefix + this.name;
    }
    Subscribe(s, bImmediate, bCr = bImmediate) {
        if (s) {
            if (bCr)
                s(this.v);
            s.bImm = bImmediate;
            this._Subs.add(s);
        }
        return this;
    }
    Unsubscribe(s) {
        this._Subs.delete(s);
    }
    get V() { return this.v; }
    set V(t) {
        if (t !== this.v) {
            this.v = t;
            this.SetDirty();
        }
    }
    get Set() {
        return (t) => t instanceof Promise ?
            ((this.V = U), t.then(v => this.V = v, onerr))
            : (this.V = t);
    }
    get Clear() {
        return _ => DVars.has(this) || (this.V = U);
    }
    get U() {
        if (!ro)
            this.SetDirty();
        return this.v;
    }
    set U(t) { this.v = t; this.SetDirty(); }
    SetDirty() {
        let b;
        for (let sub of this._Subs)
            if (sub.bImm)
                sub(this.v);
            else
                b = T;
        if (b || this.store) {
            DVars.add(this);
            RUpdate();
        }
    }
    Save() {
        this.store.setItem(this._sNm, JSON.stringify(this.v ?? N));
    }
    toString() {
        return this.v.toString();
    }
}
function Subscriber({ parN, bROnly }, bldr, r, arg) {
    if (r)
        r.updated = updCnt;
    let sArea = { parN, bROnly, r }, sEnv = CloneEnv(), subEnv = { env: sEnv, onerr, onsuc };
    return ass(async (_) => {
        let { r } = sArea, save = { env, onerr, onsuc };
        if (!r || r.updated < updCnt) {
            ({ env, onerr, onsuc } = subEnv);
            if (r)
                r.updated = updCnt;
            nodeCnt++;
            try {
                await bldr({ ...sArea }, arg);
            }
            finally {
                ({ env, onerr, onsuc } = save);
            }
        }
    }, { sArea, sEnv });
}
let env, onerr, onsuc, envActs = [], DVars = new Set(), bUpdating, hUpdate, ro = F, updCnt = 0, nodeCnt = 0, start;
function RUpdate() {
    if (!bUpdating && !hUpdate)
        hUpdate = setTimeout(DoUpdate, 5);
}
export async function DoUpdate() {
    hUpdate = N;
    if (!R.bCompiled || bUpdating)
        return;
    bUpdating = T;
    try {
        nodeCnt = 0;
        start = now();
        while (DVars.size) {
            updCnt++;
            let dv = DVars;
            DVars = new Set();
            for (let rv of dv) {
                if (rv.store)
                    rv.Save();
                for (let subs of rv._Subs)
                    if (!subs.bImm)
                        try {
                            await subs(rv instanceof _RVAR ? rv.V : rv);
                        }
                        catch (e) {
                            console.log(e = `ERROR: ` + LAbbr(e));
                            alert(e);
                        }
            }
        }
        R.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
    }
    finally {
        bUpdating = F;
    }
}
export function RVAR(nm, value, store, subs, storeName) {
    return new _RVAR(nm, value, store, storeName).Subscribe(subs, T, F);
}
function RVAR_Light(t, updTo) {
    if (!t._Subs) {
        t._Subs = new Set();
        t._UpdTo = updTo;
        Object.defineProperty(t, 'U', { get: () => {
                if (!ro) {
                    DVars.add(t);
                    if (t._UpdTo?.length)
                        for (let rvar of t._UpdTo)
                            rvar.SetDirty();
                    else
                        RUpdate();
                }
                return t;
            }
        });
        t.Subscribe = sub => t._Subs.add(sub);
    }
    return t;
}
function ApplyMod(elm, M, val, bCr) {
    let { mt, nm } = M;
    if (!M.c) {
        if (mt == 1 && nm == 'valueasnumber' && elm.type == 'number')
            nm = 'value';
        M.c = mt != 1 && mt != 5 || (nm = M.nm = ChkNm(elm, nm));
    }
    switch (mt) {
        case 0:
            elm.setAttribute(nm, val);
            break;
        case 2:
            elm.setAttribute('src', new URL(val, nm).href);
            break;
        case 1:
            if (val == N && typeof elm[nm] == 'string')
                val = '';
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
                    if (nm == 'onclick' && R.Settings.bSetPointer)
                        elm.style.cursor = val && !elm.disabled ? 'pointer' : N;
                }
            break;
        case 3:
            val && elm.classList.add(nm);
            break;
        case 4:
            elm.style[nm] = val || (val === 0 ? '0' : N);
            break;
        case 6:
            if (val)
                for (let [nm, v] of Object.entries(val))
                    elm.style[nm] = v || (v === 0 ? '0' : N);
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
                ApplyMod(elm, M, v, bCr);
            break;
        case 9:
            bCr && val.call(elm);
            break;
        case 10:
            !bCr && val.call(elm);
            break;
    }
}
function ApplyMods(elm, modifs, bCr) {
    ro = T;
    for (let M of modifs)
        try {
            ApplyMod(elm, M, M.depV.call(elm), bCr);
        }
        catch (e) {
            throw `[${M.nm}]: ` + e;
        }
    ro = F;
}
function SaveEnv() {
    return envActs.length;
}
function RestEnv(savedEnv) {
    for (let j = envActs.length; j > savedEnv; j--)
        envActs.pop()();
}
class RCompiler {
    constructor(RC, FilePath, bClr) {
        this.num = RCompiler.iNum++;
        this.cRvars = new Map();
        this.rActs = [];
        this.setPRE = new Set(['PRE']);
        this.ws = 1;
        this.rspc = T;
        this.srcNodeCnt = 0;
        this.Settings = RC ? { ...RC.Settings } : { ...defaults };
        this.FilePath = FilePath || RC?.FilePath;
        this.doc = RC?.doc || D;
        this.head = RC?.head || this.doc.head;
        if (bClr)
            RC = this;
        this.ct = RC?.ct || "";
        this.ctMap = new Map(RC?.ctMap);
        this.ctL = RC?.ctL || 0;
        this.ctSigs = new Map(RC?.ctSigs);
    }
    SaveCont() {
        return this.rActs.length;
    }
    RestCont(sv) {
        for (let j = this.rActs.length; j > sv; j--)
            this.rActs.pop()();
    }
    newV(nm) {
        let lv;
        if (!(nm = nm?.trim()))
            lv = dU;
        else {
            let { ct, ctL, ctMap } = this, i = ctMap.get(ChkId(nm));
            this.rActs.push(() => {
                this.ct = ct;
                this.ctL = ctL;
                mapSet(ctMap, nm, i);
            });
            this.ct = ct.replace(new RegExp(`\\b${nm}\\b`), '') + nm + ',';
            ctMap.set(nm, this.ctL++);
            lv =
                ((v, bUpd) => {
                    if (!bUpd)
                        envActs.push(() => env.pop());
                    env[ctL] = v;
                });
        }
        lv.nm = nm;
        return lv;
    }
    NewVars(varlist) {
        return Array.from(split(varlist), nm => this.newV(nm));
    }
    NewCons(listS) {
        let { ctL, ct, ctSigs } = this, prevCs = [];
        for (let S of listS) {
            prevCs.push([S.nm, ctSigs.get(S.nm)]);
            ctSigs.set(S.nm, [S, this.ctL++]);
            this.ct += ',';
        }
        if (!prevCs.length)
            return dU;
        this.rActs.push(() => {
            ass(this, { ctL, ct });
            for (let [nm, CS] of prevCs)
                mapSet(ctSigs, nm, CS);
        });
        return (CDefs) => {
            envActs.push(() => env.length = ctL);
            let i = ctL;
            for (let C of CDefs)
                env[i++] = C;
        };
    }
    async Compile(elm, settings = {}, childnodes) {
        let t0 = now();
        ass(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.setPRE.add(tag.toUpperCase());
        this.Builder = childnodes
            ? await this.CompChilds(elm, childnodes)
            : (await this.CompElm(elm.parentElement, elm, T))[0];
        this.bCompiled = T;
        this.log(`${this.num} Compiled ${this.srcNodeCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
    }
    log(msg) {
        if (this.Settings.bTiming)
            console.log(new Date().toISOString().substring(11) + ' ' + msg);
    }
    async Build(ar) {
        let saveR = R;
        R = this;
        env = NewEnv();
        nodeCnt++;
        await this.Builder(ar);
        R = saveR;
    }
    async CompChilds(srcParent, childNodes = srcParent.childNodes) {
        let SC = this.SaveCont();
        try {
            let bldr = await this.CompIter(srcParent, childNodes);
            return bldr ?
                async function ChildNodes(ar) {
                    let SE = SaveEnv();
                    try {
                        await bldr(ar);
                    }
                    finally {
                        RestEnv(SE);
                    }
                }
                : dumB;
        }
        finally {
            this.RestCont(SC);
        }
    }
    async CompIter(srcParent, iter) {
        let bldrs = [], { rspc } = this, arr = Array.from(iter), i = 0;
        while (rspc && arr.length && reWS.test(arr[arr.length - 1].nodeValue))
            arr.pop();
        for (let srcNode of arr) {
            this.rspc = ++i == arr.length && rspc;
            let trip;
            switch (srcNode.nodeType) {
                case Node.ELEMENT_NODE:
                    this.srcNodeCnt++;
                    trip = await this.CompElm(srcParent, srcNode);
                    break;
                case Node.TEXT_NODE:
                    this.srcNodeCnt++;
                    let str = srcNode.nodeValue;
                    let getText = this.CompString(str), { fixed } = getText;
                    if (fixed !== '') {
                        trip =
                            [fixed
                                    ? async (ar) => PrepCharData(ar, fixed)
                                    : async (ar) => PrepCharData(ar, getText()), srcNode,
                                fixed == ' '];
                        if (this.ws < 4)
                            this.ws = / $/.test(str) ? 2 : 3;
                    }
                    break;
                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        let getText = this.CompString(srcNode.nodeValue, 'Comment');
                        trip =
                            [async (ar) => PrepCharData(ar, getText(), T), srcNode, 1];
                    }
                    break;
            }
            if (trip ? trip[0].ws : this.rspc)
                prune();
            if (trip)
                bldrs.push(trip);
        }
        function prune() {
            let i = bldrs.length, isB;
            while (i-- && (isB = bldrs[i][2]))
                if (isB === T)
                    bldrs.splice(i, 1);
        }
        if (rspc)
            prune();
        if (!bldrs.length)
            return N;
        return setWs(async function Iter(ar, start = 0) {
            let i = 0, toSubscribe = [];
            if (!ar.r) {
                for (let [bldr] of bldrs) {
                    i++;
                    await bldr(ar);
                    if (bldr.auto)
                        toSubscribe.push([Subscriber(ar, Iter, ar.prevR, i), ar.prevR.val._Subs.size]);
                }
                for (let [subs, s] of toSubscribe) {
                    let { sArea } = subs, r = sArea.r, rvar = r.val;
                    if (rvar._Subs.size == s && r.next) {
                        (sArea.r = r.next).updated = updCnt;
                        rvar.Subscribe(rvar.auto = subs);
                    }
                }
            }
            else
                for (let [bldr] of bldrs)
                    if (i++ >= start) {
                        let r = ar.r;
                        await bldr(ar);
                        if (bldr.auto && r.val?.auto)
                            assEnv(r.val.auto.sEnv, env);
                    }
            nodeCnt += bldrs.length - start;
        }, bldrs[0][0].ws);
    }
    async CompElm(srcPrnt, srcElm, bUnhide) {
        try {
            let tag = srcElm.tagName, atts = new Atts(srcElm), cl = this.ctL, reacts = [], befor = [], after = [], CTL = this.rActs.length, dOnerr, dOnsuc, bldr, elmBldr, isBl, m, nm, constr = this.ctSigs.get(tag), dIf = this.CompAttrExpr(atts, 'if'), dH = tag != 'FOR' && this.compAttrExprList(atts, 'hash');
            for (let att of atts.keys())
                if (m = genAtts.exec(att))
                    if (m[1])
                        att == 'on' && tag != 'REACT' || reacts.push({ att, dRV: this.compAttrExprList(atts, att, T) });
                    else {
                        let txt = atts.g(att);
                        if (nm = m[3])
                            (m[2] ? befor : after).push({ att, txt, C: /c/i.test(nm), U: /u/i.test(nm), D: /y/i.test(nm) });
                        else {
                            let hndlr = this.CompHandlr(att, txt);
                            if (m[5])
                                (dOnerr = hndlr).bBldr = !/-$/.test(att);
                            else
                                dOnsuc = hndlr;
                        }
                    }
            if (bUnhide)
                atts.set('#hidden', 'false');
            if (constr)
                bldr = await this.CompInstance(srcElm, atts, constr);
            else {
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            NoChildren(srcElm);
                            let rv = atts.g('rvar'), t = '@value', t_val = rv && atts.g(t), dSet = t_val && this.CompTarget(t_val, t), dGet = t_val ? this.CompJScript(t_val, t) : this.CompParam(atts, 'value'), dUpd = rv && this.CompAttrExpr(atts, 'updates'), dSto = rv && this.CompAttrExpr(atts, 'store'), dSNm = dSto && this.CompParam(atts, 'storename'), bUpd = atts.gB('reacting') || atts.gB('updating') || t_val, vLet = this.newV(rv || atts.g('let') || atts.g('var', T)), onMod = rv && this.CompParam(atts, 'onmodified');
                            bldr = async function DEF(ar, bReOn) {
                                let { r, bCr } = PrepArea(srcElm, ar);
                                if (bCr || bUpd || bReOn) {
                                    ro = T;
                                    let v = dGet?.();
                                    ro = F;
                                    if (rv)
                                        if (bCr) {
                                            let rvUp = dUpd?.();
                                            (r.val =
                                                RVAR(rv, v, dSto?.(), dSet?.(), dSNm?.()))
                                                .Subscribe(rvUp?.SetDirty?.bind(rvUp))
                                                .Subscribe(onMod?.());
                                        }
                                        else
                                            r.val.Set(v);
                                    else
                                        r.val = v;
                                }
                                vLet(r.val);
                            };
                            if (rv && !onMod) {
                                let a = this.cRvars.get(rv);
                                this.cRvars.set(rv, T);
                                this.rActs.push(() => {
                                    if (elmBldr)
                                        elmBldr.auto = this.cRvars.get(rv);
                                    this.cRvars.set(rv, a);
                                });
                            }
                            isBl = 1;
                        }
                        break;
                    case 'IF':
                    case 'CASE':
                        {
                            let bHiding = atts.gB('hiding'), dVal = this.CompAttrExpr(atts, 'value'), caseNodes = [], body = [], bThen;
                            for (let node of srcElm.childNodes) {
                                if (node instanceof HTMLElement)
                                    switch (node.tagName) {
                                        case 'THEN':
                                            bThen = T;
                                            new Atts(node).NoneLeft();
                                            caseNodes.push({ node: node, atts, body: node.childNodes });
                                            continue;
                                        case 'ELSE':
                                        case 'WHEN':
                                            caseNodes.push({ node: node, atts: new Atts(node), body: node.childNodes });
                                            continue;
                                    }
                                body.push(node);
                            }
                            if (!bThen)
                                if (srcElm.tagName == 'IF')
                                    caseNodes.unshift({ node: srcElm, atts, body });
                                else
                                    atts.NoneLeft();
                            let caseList = [], { ws, rspc } = this, postWs = 0;
                            for (let { node, atts, body } of caseNodes) {
                                let SC = this.SaveCont();
                                ass(this, { ws, rspc });
                                try {
                                    let cond, not = T, patt, p;
                                    switch (node.tagName) {
                                        case 'IF':
                                        case 'THEN':
                                        case 'WHEN':
                                            cond = this.CompAttrExpr(atts, 'cond');
                                            not = !atts.gB('not');
                                            patt =
                                                (p = atts.g('match')) != N
                                                    ? this.CompPatt(p)
                                                    : (p = atts.g('urlmatch')) != N
                                                        ? this.CompPatt(p, T)
                                                        : (p = atts.g('regmatch')) != N
                                                            ? { regex: new RegExp(p, 'i'),
                                                                lvars: this.NewVars(atts.g('captures'))
                                                            }
                                                            : N;
                                            if (bHiding && patt?.lvars.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !dVal)
                                                throw `Match requested but no 'value' specified.`;
                                        case 'ELSE':
                                            caseList.push({
                                                cond, not, patt,
                                                bldr: await this.CompChilds(node, body),
                                                node
                                            });
                                            atts.NoneLeft();
                                            postWs = Math.max(postWs, this.ws);
                                            continue;
                                    }
                                }
                                catch (e) {
                                    throw node.tagName == 'IF' ? e : ErrMsg(node, e);
                                }
                                finally {
                                    this.RestCont(SC);
                                }
                            }
                            this.ws = postWs;
                            bldr =
                                async function CASE(ar) {
                                    let value = dVal?.(), cAlt, rRes;
                                    for (let alt of caseList)
                                        try {
                                            if (!((!alt.cond || alt.cond())
                                                && (!alt.patt || value != N && (rRes = alt.patt.regex.exec(value)))) != alt.not) {
                                                cAlt = alt;
                                                break;
                                            }
                                        }
                                        catch (e) {
                                            if (bHiding)
                                                for (let alt of caseList)
                                                    PrepElm(alt.node, ar);
                                            else
                                                PrepArea(srcElm, ar, '', 1, cAlt);
                                            throw alt.node.tagName == 'IF' ? e : ErrMsg(alt.node, e);
                                        }
                                    if (bHiding) {
                                        for (let alt of caseList) {
                                            let { r, chAr, bCr } = PrepElm(alt.node, ar);
                                            if ((!(r.node.hidden = alt != cAlt)
                                                || bCr)
                                                && !ar.bROnly)
                                                await R.ErrHandling(alt.bldr, alt.node, chAr);
                                        }
                                    }
                                    else {
                                        let { sub, bCr } = PrepArea(srcElm, ar, '', 1, cAlt);
                                        if (cAlt && (!ar.bROnly || bCr)) {
                                            let SE = SaveEnv(), i = 0;
                                            try {
                                                if (cAlt.patt)
                                                    for (let lv of cAlt.patt.lvars)
                                                        lv((cAlt.patt.url ? decodeURIComponent : s => s)(rRes[++i]));
                                                await R.ErrHandling(cAlt.bldr, cAlt.node, sub);
                                            }
                                            finally {
                                                RestEnv(SE);
                                            }
                                        }
                                    }
                                };
                        }
                        break;
                    case 'FOR':
                        bldr = await this.CompFor(srcElm, atts);
                        break;
                    case 'MODULE':
                        atts.g('id');
                        break;
                    case 'INCLUDE':
                        let src = atts.g('src', T);
                        if (srcElm.children.length || srcElm.textContent.trim())
                            bldr = await this.CompChilds(srcElm);
                        else {
                            let C = new RCompiler(this, this.GetPath(src)), task = C.Compile(N, { bSubfile: T }, await this.fetchModule(src));
                            bldr =
                                async function INCLUDE(ar) {
                                    let t0 = now();
                                    await task;
                                    start += now() - t0;
                                    await C.Builder(ar);
                                };
                        }
                        break;
                    case 'IMPORT':
                        {
                            let src = atts.g('src', T), bIncl = atts.gB('include'), lvars = this.NewVars(atts.g('defines')), bAsync = atts.gB('async'), listImps = Array.from(srcElm.children).map(ch => this.ParseSign(ch)), DC = this.NewCons(listImps), promModule = RModules.get(src);
                            if (!promModule) {
                                let C = new RCompiler(this, this.GetPath(src), T);
                                C.Settings.bSubfile = T;
                                promModule = this.fetchModule(src).then(async (nodes) => {
                                    let bldr = (await C.CompIter(N, nodes)) || dumB;
                                    for (let clientSig of listImps) {
                                        let signat = C.ctSigs.get(clientSig.nm);
                                        if (!signat)
                                            throw `<${clientSig.nm}> is missing in '${src}'`;
                                        if (bAsync && !clientSig.IsCompat(signat[0]))
                                            throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signat[0].srcElm.outerHTML}`;
                                    }
                                    for (let v of lvars)
                                        if ((v.k = C.ctMap.get(v.nm)) == N)
                                            throw `Module does not define '${v.nm}'`;
                                    return [bldr, C.ctSigs];
                                });
                                RModules.set(src, promModule);
                            }
                            if (!bAsync) {
                                let prom = promModule.then(M => {
                                    for (let sig of listImps)
                                        ass(sig, M[1].get(sig.nm)[0]);
                                });
                                for (let sig of listImps)
                                    sig.prom = prom;
                            }
                            bldr = async function IMPORT(reg) {
                                let [bldr, CSigns] = await promModule, saveEnv = env, MEnv = env = NewEnv();
                                await bldr(bIncl ? reg : { parN: D.createDocumentFragment() });
                                env = saveEnv;
                                DC(mapI(listImps, S => MEnv[CSigns.get(S.nm)[1]]));
                                for (let lv of lvars)
                                    lv(MEnv[lv.k]);
                            };
                            isBl = 1;
                        }
                        break;
                    case 'REACT':
                        {
                            let b = bldr = await this.CompChilds(srcElm);
                            isBl = b == dumB;
                            if (atts.gB('renew')) {
                                bldr = function renew(sub) {
                                    return b(PrepArea(srcElm, sub, 'renew', 2).sub);
                                };
                            }
                        }
                        break;
                    case 'RHTML':
                        {
                            NoChildren(srcElm);
                            let dSrctext = this.CompParam(atts, 'srctext', T), modifs = this.CompAtts(atts), lThis = this;
                            this.ws = 1;
                            bldr = async function RHTML(ar) {
                                let src = dSrctext(), { r, bCr } = PrepElm(srcElm, ar, 'rhtml-rhtml'), { node } = r;
                                ApplyMods(node, modifs, bCr);
                                if (ar.prevR || src != r.res) {
                                    r.res = src;
                                    let svEnv = env, C = new RCompiler(N, lThis.FilePath), sRoot = C.head = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = D.createElement('rhtml'), sArea = {
                                        parN: sRoot,
                                        r: N,
                                        parR: r.child || (r.child = new Range(N, N, 'Shadow'))
                                    };
                                    r.child.erase(sRoot);
                                    sRoot.innerHTML = '';
                                    try {
                                        tempElm.innerHTML = src;
                                        await C.Compile(tempElm, { bSubfile: T, bTiming: lThis.Settings.bTiming }, tempElm.childNodes);
                                        await C.Build(sArea);
                                    }
                                    catch (e) {
                                        sRoot.appendChild(createErrNode(`Compile error: ` + e));
                                    }
                                    finally {
                                        env = svEnv;
                                    }
                                }
                            };
                        }
                        break;
                    case 'SCRIPT':
                        bldr = await this.CompScript(srcPrnt, srcElm, atts);
                        isBl = 1;
                        break;
                    case 'STYLE':
                        this.head.appendChild(srcElm);
                        isBl = 1;
                        break;
                    case 'COMPONENT':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBl = 1;
                        break;
                    case 'DOCUMENT':
                        {
                            let vDoc = this.newV(atts.g('name', T)), RC = new RCompiler(this), bEncaps = atts.gB('encapsulate'), vParams = RC.NewVars(atts.g('params')), vWin = RC.newV(atts.g('window')), docBldr = ((RC.head = D.createElement('DocumentFragment')), await RC.CompChilds(srcElm));
                            bldr = async function DOCUMENT(ar) {
                                let { r, bCr } = PrepArea(srcElm, ar, vDoc.name);
                                if (bCr) {
                                    let doc = ar.parN.ownerDocument, docEnv = CloneEnv(), wins = r.wins = new Set();
                                    r.val = {
                                        async render(w, bCr, args) {
                                            let svEnv = env, i = 0, d = w.document;
                                            env = docEnv;
                                            for (let lv of vParams)
                                                lv(args[i++]);
                                            vWin(w);
                                            try {
                                                if (bCr) {
                                                    if (!bEncaps)
                                                        copySSheets(doc, d);
                                                    for (let S of RC.head.childNodes)
                                                        d.head.append(S.cloneNode(T));
                                                }
                                                let ar = { parN: d.body, r: w.r };
                                                await docBldr(ar);
                                            }
                                            finally {
                                                env = svEnv;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let w = W.open('', target || '', features), bCr = !childWins.has(w);
                                            if (bCr) {
                                                w.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                    this.close(); });
                                                w.addEventListener('close', () => childWins.delete(w), wins.delete(w));
                                                childWins.add(w);
                                                wins.add(w);
                                            }
                                            else
                                                w.document.body.innerHTML = '';
                                            this.render(w, bCr, args);
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
                                    };
                                }
                                vDoc(r.val);
                            };
                            isBl = 1;
                        }
                        break;
                    case 'RHEAD':
                        {
                            let childBuilder = await this.CompChilds(srcElm), { ws } = this;
                            this.ws = this.rspc = 1;
                            bldr = async function HEAD(ar) {
                                let { sub } = PrepArea(srcElm, ar);
                                sub.parN = ar.parN.ownerDocument.head;
                                sub.bfor = N;
                                await childBuilder(sub);
                                if (sub.prevR)
                                    sub.prevR.parN = sub.parN;
                            };
                            this.ws = ws;
                            isBl = 1;
                        }
                        break;
                    case 'RSTYLE':
                        let save = [this.Settings.bDollarRequired, this.rIS, this.ws];
                        this.Settings.bDollarRequired = T;
                        this.rIS = N;
                        this.ws = 4;
                        let childBldr = await this.CompChilds(srcElm);
                        [this.Settings.bDollarRequired, this.rIS, this.ws] = save;
                        bldr = function RSTYLE(ar) {
                            return childBldr(PrepElm(srcElm, ar, 'STYLE').chAr);
                        };
                        isBl = 1;
                        break;
                    case 'ELEMENT':
                        bldr = await this.CompHTMLElm(srcElm, atts, this.CompParam(atts, 'tagname', T));
                        this.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChildren(srcElm);
                        let dNm = this.CompParam(atts, 'name', T), dVal = this.CompParam(atts, 'value', T);
                        bldr = async function ATTRIB(ar) {
                            let nm = dNm(), { r } = PrepArea(srcElm, ar);
                            if (r.val && nm != r.val)
                                ar.parN.removeAttribute(r.val);
                            if (r.val = nm)
                                ar.parN.setAttribute(nm, dVal());
                        };
                        isBl = 1;
                        break;
                    default:
                        bldr = await this.CompHTMLElm(srcElm, atts);
                        break;
                }
                atts.NoneLeft();
            }
            let { ws } = bldr || (bldr = dumB), bba, ill = this.rActs.length > CTL && (dH && 'hash' || dIf && '#if');
            if (ill)
                throw `'${ill}' not possible for declarations`;
            if (dOnerr || dOnsuc) {
                let b = bldr;
                bldr = async function SetOnError(ar) {
                    let oo = { onerr, onsuc };
                    try {
                        if (dOnerr)
                            (onerr = dOnerr()).bBldr = dOnerr.bBldr;
                        if (dOnsuc)
                            onsuc = dOnsuc();
                        await b(ar);
                    }
                    finally {
                        ({ onerr, onsuc } = oo);
                    }
                };
            }
            for (let g of conc(befor, after))
                bba = g.hndlr = this.CompHandlr(g.att, g.txt);
            if (bba) {
                let b = bldr;
                bldr = async function ON(ar, x) {
                    let r = ar.r, bfD;
                    for (let g of befor) {
                        if (g.D && !r)
                            bfD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(r?.node || ar.parN);
                    }
                    await b(ar, x);
                    if (bfD)
                        ar.prevR.bfDest = bfD;
                    for (let g of after) {
                        if (g.D && !r)
                            ar.prevR.onDest = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call((r ? r.node : ar.prevR?.node) || ar.parN);
                    }
                };
                isBl && (isBl = 1);
            }
            if (dH) {
                let b = bldr;
                bldr = async function HASH(ar) {
                    let { sub, r, bCr } = PrepArea(srcElm, ar, 'hash'), hashes = dH();
                    if (bCr || hashes.some((hash, i) => hash !== r.val[i])) {
                        r.val = hashes;
                        await b(sub);
                    }
                };
            }
            if (dIf) {
                let b = bldr;
                bldr = function hif(ar) {
                    let c = dIf(), { sub } = PrepArea(srcElm, ar, '#if', 1, !c);
                    if (c)
                        return b(sub);
                };
            }
            for (let { att, dRV } of reacts) {
                let b = bldr, ub = /^this/.test(att)
                    ? function reacton(sub) {
                        sub.bROnly = T;
                        return b(sub, T);
                    }
                    : b;
                bldr = async function REACT(ar) {
                    let { r, sub, bCr } = PrepArea(srcElm, ar, att);
                    await b(sub);
                    let rvars = dRV(), subs, pVars, i = 0;
                    if (bCr)
                        subs = r.subs = Subscriber(sub, ub, r.child, T);
                    else {
                        ({ subs, rvars: pVars } = r);
                        if (!subs)
                            return;
                        assEnv(subs.sEnv, env);
                    }
                    r.rvars = rvars;
                    r.val = sub.prevR?.val;
                    for (let rvar of rvars) {
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
                            throw `[${att}] This is not an RVAR`;
                        }
                    }
                };
            }
            return bldr == dumB ? N : [elmBldr = setWs(this.ctL == cl
                    ? function Elm(ar) {
                        return R.ErrHandling(bldr, srcElm, ar);
                    }
                    : function Elm(ar) {
                        return bldr(ar).catch(e => { throw ErrMsg(srcElm, e, 39); });
                    }, ws), srcElm, isBl];
        }
        catch (e) {
            throw ErrMsg(srcElm, e);
        }
    }
    async ErrHandling(bldr, srcNode, ar) {
        let { r } = ar;
        if (r?.errN) {
            ar.parN.removeChild(r.errN);
            r.errN = U;
        }
        try {
            await bldr(ar);
        }
        catch (e) {
            let msg = srcNode instanceof HTMLElement ? ErrMsg(srcNode, e, 39) : e;
            if (this.Settings.bAbortOnError)
                throw msg;
            console.log(msg);
            if (onerr?.bBldr)
                onerr(e);
            else if (this.Settings.bShowErrors) {
                let errN = ar.parN.insertBefore(createErrNode(msg), ar.r?.FirstOrNext);
                if (r)
                    r.errN = errN;
            }
        }
    }
    async CompScript(_srcParent, srcElm, atts) {
        let { type, text, defer, async } = srcElm, src = atts.g('src'), defs = atts.g('defines'), varlist = [...split(defs)], bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), bUpd = atts.gB('updating'), { ct } = this, lvars = mOto && mOto[2] && this.NewVars(defs), exp, defNames = lvars
            ? (e) => lvars.forEach((lv, i) => lv(e[i]))
            : (e) => varlist.forEach((nm, i) => G[nm] = e[i]);
        atts.clear();
        if (mOto || (bCls || bMod) && this.Settings.bSubfile) {
            if (mOto && mOto[3]) {
                let prom = (async () => gEval(`'use strict';([${ct}])=>{${src ? await this.FetchText(src) : text}\n;return[${defs}]}`))();
                return async function LSCRIPT(ar) {
                    let { r, bCr } = PrepArea(srcElm, ar);
                    defNames(bUpd || bCr ? r.res = (await prom)(env) : r.res);
                };
            }
            else if (bMod) {
                let prom = src
                    ? import(this.GetURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => p1 + this.GetURL(p2) + p3)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src));
                return async function MSCRIPT() {
                    let obj;
                    defNames(exp || (exp = (obj = await prom,
                        varlist.map(nm => {
                            if (!(nm in obj))
                                throw `'${nm}' is not exported by this script`;
                            return obj[nm];
                        }))));
                };
            }
            else {
                let prom = (async () => `${mOto ? "'use strict';" : ""}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    prom = prom.then(txt => void (exp = gEval(txt)));
                else if (!mOto && !defer)
                    exp = gEval(await prom);
                return async function SCRIPT() {
                    defNames(exp || (exp = gEval(await prom)));
                };
            }
        }
    }
    async CompFor(srcElm, atts) {
        let letNm = atts.g('let') ?? atts.g('var'), idxNm = atts.g('index'), SC = this.SaveCont();
        if (idxNm == '')
            idxNm = 'index';
        this.rspc = F;
        try {
            if (letNm != N) {
                let pvNm = atts.g('previous'), nxNm = atts.g('next');
                if (pvNm == '')
                    pvNm = 'previous';
                if (nxNm == '')
                    nxNm = 'next';
                let getRange = this.CompAttrExpr(atts, 'of', T, iter => iter && !(Symbol.iterator in iter || Symbol.asyncIterator in iter)
                    && `Value (${iter}) is not iterable`), dUpd = this.CompAttrExpr(atts, 'updates'), bReact = atts.gB('reacting') || atts.gB('reactive') || !!dUpd, vLet = this.newV(letNm), vIdx = this.newV(idxNm), vPrev = this.newV(pvNm), vNext = this.newV(nxNm), dKey = this.CompAttrExpr(atts, 'key'), dHash = this.compAttrExprList(atts, 'hash'), bodyBldr = await this.CompChilds(srcElm);
                return async function FOR(ar) {
                    let { r, sub } = PrepArea(srcElm, ar, ''), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Next, iterable = getRange() || E, pIter = async (iter) => {
                        let SE = SaveEnv();
                        try {
                            let keyMap = r.val || (r.val = new Map()), nwMap = new Map();
                            vLet();
                            vIdx();
                            let idx = 0;
                            for await (let item of iter) {
                                vLet(item, T);
                                vIdx(idx, T);
                                let hash = dHash?.(), key = dKey?.() ?? hash?.[0];
                                if (key != N && nwMap.has(key))
                                    throw `Duplicate key '${key}'`;
                                nwMap.set(key ?? {}, { item, hash, idx: idx++ });
                            }
                            let nxChR = r.child, iterator = nwMap.entries(), nxIter = nxNm && nwMap.values(), prItem, nxItem, prevR, chAr;
                            sub.parR = r;
                            vPrev();
                            vNext();
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
                                    nxChR = nxChR.next;
                                }
                                if (nx.done)
                                    break;
                                let [key, { item, hash, idx }] = nx.value, chRng = keyMap.get(key), bCr = !chRng;
                                if (nxIter)
                                    nxItem = nxIter.next().value?.item;
                                if (bCr) {
                                    sub.r = N;
                                    sub.prevR = prevR;
                                    sub.bfor = nxChR?.FirstOrNext || bfor;
                                    ({ r: chRng, sub: chAr } = PrepArea(N, sub, `${letNm}(${idx})`));
                                    if (key != N)
                                        keyMap.set(key, chRng);
                                    chRng.key = key;
                                }
                                else {
                                    if (chRng.fragm) {
                                        parN.insertBefore(chRng.fragm, nxChR?.FirstOrNext || bfor);
                                        chRng.fragm = N;
                                    }
                                    else
                                        while (T) {
                                            if (nxChR == chRng)
                                                nxChR = nxChR.next;
                                            else {
                                                if (nwMap.get(nxChR.key)?.idx > idx + 2) {
                                                    let fr = nxChR.fragm = D.createDocumentFragment();
                                                    for (let node of nxChR.Nodes())
                                                        fr.appendChild(node);
                                                    nxChR = nxChR.next;
                                                    continue;
                                                }
                                                chRng.prev.next = chRng.next;
                                                if (chRng.next)
                                                    chRng.next.prev = chRng.prev;
                                                let nxNode = nxChR?.FirstOrNext || bfor;
                                                for (let node of chRng.Nodes())
                                                    parN.insertBefore(node, nxNode);
                                            }
                                            break;
                                        }
                                    chRng.next = nxChR;
                                    chRng.text = `${letNm}(${idx})`;
                                    if (prevR)
                                        prevR.next = chRng;
                                    else
                                        r.child = chRng;
                                    sub.r = chRng;
                                    chAr = PrepArea(N, sub, '').sub;
                                    sub.parR = N;
                                }
                                chRng.prev = prevR;
                                prevR = chRng;
                                if (bCr || !hash
                                    || hash.some((h, i) => h != chRng.hash[i])) {
                                    chRng.hash = hash;
                                    if (bReact && (bCr || item != chRng.rvars[0])) {
                                        RVAR_Light(item, dUpd && [dUpd()]);
                                        if (chRng.subs)
                                            item._Subs = chRng.rvars[0]._Subs;
                                    }
                                    vLet(item, T);
                                    vIdx(idx, T);
                                    vPrev(prItem, T);
                                    vNext(nxItem, T);
                                    await bodyBldr(chAr);
                                    if (bReact)
                                        if (chRng.subs)
                                            assEnv(chRng.subs.sEnv, env);
                                        else {
                                            item.Subscribe(chRng.subs = Subscriber(chAr, bodyBldr, chRng.child));
                                            chRng.rvars = [item];
                                        }
                                }
                                prItem = item;
                            }
                            if (prevR)
                                prevR.next = N;
                            else
                                r.child = N;
                        }
                        finally {
                            RestEnv(SE);
                        }
                    };
                    if (iterable instanceof Promise) {
                        let subEnv = { env: CloneEnv(), onerr, onsuc };
                        r.rvars = [RVAR(N, iterable, N, r.subs =
                                async (iter) => {
                                    let save = { env, onerr, onsuc };
                                    ({ env, onerr, onsuc } = subEnv);
                                    try {
                                        await pIter(iter);
                                    }
                                    finally {
                                        ({ env, onerr, onsuc } = save);
                                    }
                                })];
                    }
                    else
                        await pIter(iterable);
                };
            }
            else {
                let nm = atts.g('of', T, T).toUpperCase(), CSK = this.ctSigs.get(nm);
                if (!CSK)
                    throw `Missing attribute [let]`;
                let ck = CSK[1], vIdx = this.newV(idxNm), bodyBldr = await this.CompChilds(srcElm);
                return async function FOREACH_Slot(ar) {
                    let { sub } = PrepArea(srcElm, ar), SE = SaveEnv(), slotDef = env[ck], idx = 0;
                    vIdx();
                    try {
                        for (let slotBldr of slotDef.tmplts) {
                            vIdx(idx++, T);
                            env[ck] = { nm: nm, tmplts: [slotBldr], CEnv: slotDef.CEnv };
                            await bodyBldr(sub);
                        }
                    }
                    finally {
                        env[ck] = slotDef;
                        RestEnv(SE);
                    }
                };
            }
        }
        finally {
            this.RestCont(SC);
        }
    }
    ParseSign(elmSignat) {
        let sig = new Signature(elmSignat);
        for (let attr of elmSignat.attributes) {
            if (sig.RP)
                throw `Rest parameter must be last`;
            let m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                let param = {
                    mode: m[1],
                    nm: m[2],
                    pDflt: m[1] == '...' ? () => E
                        : attr.value != ''
                            ? (m[1] == '#' ? this.CompJScript(attr.value, attr.name) : this.CompString(attr.value, attr.name))
                            : m[3] ? /^on/.test(m[2]) ? () => _ => N : dU
                                : N
                };
                sig.Params.push(param);
                if (m[1] == '...')
                    sig.RP = param;
            }
        }
        for (let elmSlot of elmSignat.children) {
            let s = this.ParseSign(elmSlot);
            s.bCln = s.Slots.size;
            mapNm(sig.Slots, s);
            if (/^CONTENT/.test(s.nm)) {
                if (sig.CSlot)
                    throw 'Multiple content slots';
                sig.CSlot = s;
            }
        }
        return sig;
    }
    async CompComponent(srcElm, atts) {
        let bldr, bRec = atts.gB('recursive'), { head, ws } = this, signats = [], tmplts = [], encStyles = atts.gB('encapsulate')
            && (this.head = srcElm.ownerDocument.createDocumentFragment()).children, arr = Array.from(srcElm.children), elmSign = arr.shift(), elmTempl = arr.pop(), t = /^TEMPLATE(S)?$/.exec(elmTempl?.tagName);
        if (!elmSign)
            throw 'Missing signature(s)';
        if (!t)
            throw 'Missing template(s)';
        for (let elm of /^SIGNATURES?$/.test(elmSign.tagName) ? elmSign.children : [elmSign])
            signats.push(this.ParseSign(elm));
        let DC = bRec && this.NewCons(signats), SC = this.SaveCont();
        try {
            bldr = await this.CompIter(srcElm, arr);
            let mapS = new Map(mapI(signats, S => [S.nm, S]));
            async function AddTemp(RC, nm, prnt, elm) {
                let S = mapS.get(nm);
                if (!S)
                    throw `<${nm}> has no signature`;
                tmplts.push({
                    nm,
                    tmplts: [await RC.CompTempl(S, prnt, elm, F, encStyles)]
                });
                mapS.delete(nm);
            }
            if (t[1])
                for (let elm of elmTempl.children)
                    await AddTemp(this, elm.tagName, elm, elm);
            else
                await AddTemp(this, signats[0].nm, elmTempl.content, elmTempl);
            for (let nm of mapS.keys())
                throw `Signature <${nm}> has no template`;
        }
        finally {
            this.RestCont(SC);
            ass(this.head, { head, ws });
        }
        DC || (DC = this.NewCons(signats));
        return async function COMPONENT(ar) {
            let constr = tmplts.map(C => ({ ...C }));
            if (bRec)
                DC(constr);
            let SE = SaveEnv();
            try {
                bldr && await R.ErrHandling(bldr, srcElm, ar);
                let CEnv = CloneEnv();
                for (let c of constr)
                    c.CEnv = CEnv;
            }
            finally {
                RestEnv(SE);
            }
            if (!bRec)
                DC(constr);
        };
    }
    async CompTempl(signat, contentNode, srcElm, bIsSlot, encStyles, atts) {
        let SC = this.SaveCont();
        try {
            let { ctL } = this, myAtts = atts || new Atts(srcElm), lvars = signat.Params.map(({ mode, nm }) => [nm, this.newV((myAtts.g(mode + nm) ?? myAtts.g(nm, bIsSlot)) || nm)]), DC = this.NewCons(signat.Slots.values());
            if (!atts)
                myAtts.NoneLeft();
            this.ws = this.rspc = 1;
            let bldr = await this.CompChilds(contentNode), Cnm = signat.nm, custNm = /^[A-Z].*-/.test(Cnm) ? Cnm : `rhtml-${Cnm}`;
            return async function TEMPLATE(ar, args, mSlots, cdef, CEnv) {
                env = cdef.CEnv;
                if (env.length > ctL)
                    env = cdef.CEnv = env.slice(0, ctL);
                let SE = SaveEnv(), i = 0;
                try {
                    for (let [nm, lv] of lvars) {
                        let arg = args[nm];
                        lv(arg !== U ? arg : signat.Params[i]?.pDflt?.());
                        i++;
                    }
                    DC(mapI(mSlots, ([nm, tmplts]) => ({ nm, tmplts, CEnv, Cnm })));
                    if (encStyles) {
                        let { r: elmRange, chAr, bCr } = PrepElm(srcElm, ar, custNm), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                        if (bCr)
                            for (let style of encStyles)
                                shadow.appendChild(style.cloneNode(T));
                        if (signat.RP)
                            ApplyMod(elm, { mt: 8, nm: N, depV: N }, args[signat.RP.nm], bCr);
                        chAr.parN = shadow;
                        ar = chAr;
                    }
                    await bldr(ar);
                }
                finally {
                    RestEnv(SE);
                }
            };
        }
        catch (e) {
            throw ErrMsg(srcElm, 'template: ' + e);
        }
        finally {
            this.RestCont(SC);
        }
    }
    async CompInstance(srcElm, atts, [signat, ck]) {
        if (signat.prom)
            await signat.prom;
        let { RP, CSlot } = signat, getArgs = [], SBldrs = new Map();
        for (let [nm] of signat.Slots)
            SBldrs.set(nm, []);
        for (let { mode, nm, pDflt } of signat.Params)
            if (mode == '@') {
                let attVal = atts.g(mode + nm, !pDflt);
                getArgs.push(attVal
                    ? [nm, this.CompJScript(attVal, mode + nm),
                        this.CompJScript(`$=>{${attVal}=$}`, nm)
                    ]
                    : [nm, U, dU]);
            }
            else if (mode != '...') {
                let dH = this.CompParam(atts, nm, !pDflt);
                if (dH)
                    getArgs.push([nm, dH]);
            }
        let slotElm, slot, nm;
        for (let node of Array.from(srcElm.children))
            if ((slot = signat.Slots.get(nm = (slotElm = node).tagName))
                && slot != CSlot) {
                SBldrs.get(nm).push(await this.CompTempl(slot, slotElm, slotElm, T));
                srcElm.removeChild(node);
            }
        if (CSlot)
            SBldrs.get(CSlot.nm).push(await this.CompTempl(CSlot, srcElm, srcElm, T, N, atts));
        if (RP) {
            let modifs = this.CompAtts(atts);
            getArgs.push([
                RP.nm,
                () => modifs.map(M => ({ M, v: M.depV() }))
            ]);
        }
        atts.NoneLeft();
        this.ws = 3;
        return async function INSTANCE(ar) {
            let { r, sub, bCr } = PrepArea(srcElm, ar), cdef = env[ck], IEnv = env, SEnv, args = r.res || (r.res = {});
            if (!cdef)
                return;
            ro = T;
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bCr)
                    args[nm] = RVAR('', dGet?.(), N, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            ro = F;
            try {
                for (let templ of cdef.tmplts)
                    await templ(sub, args, SBldrs, cdef, SEnv || (SEnv = signat.bCln ? CloneEnv(IEnv) : IEnv));
            }
            finally {
                env = IEnv;
            }
        };
    }
    async CompHTMLElm(srcElm, atts, dTag) {
        let nm = dTag ? N : srcElm.tagName.replace(/\.+$/, ''), preWs = this.ws, postWs;
        if (this.setPRE.has(nm)) {
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
        let modifs = this.CompAtts(atts), childBldr = await this.CompChilds(srcElm);
        if (postWs)
            this.ws = postWs;
        return setWs(async function ELM(ar) {
            let { r: { node }, chAr, bCr } = PrepElm(srcElm, ar, nm || dTag());
            if (!ar.bROnly)
                await childBldr(chAr);
            node.removeAttribute('class');
            if (node.hndlrs) {
                for (let { evType, listener } of node.hndlrs)
                    node.removeEventListener(evType, listener);
                node.hndlrs = [];
            }
            ApplyMods(node, modifs, bCr);
        }, postWs == 1 || preWs < 4 && childBldr.ws);
    }
    CompAtts(atts) {
        let modifs = [], m;
        function addM(mt, nm, depV) {
            modifs.push({ mt, nm, depV });
        }
        for (let [nm, V] of atts) {
            try {
                if (m = /(.*?)\.+$/.exec(nm))
                    addM(0, nm, this.CompString(V, nm));
                else if (m = /^on(.*?)\.*$/i.exec(nm))
                    addM(5, m[0], this.AddErrH(this.CompHandlr(nm, V)));
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    addM(3, m[1], this.CompJScript(V, nm));
                else if (m = /^(#)?style\.(.*)$/.exec(nm))
                    addM(4, CapProp(m[2]), m[1] ? this.CompJScript(V, nm) : this.CompString(V, nm));
                else if (nm == '+style')
                    addM(6, nm, this.CompJScript(V, nm));
                else if (nm == "+class")
                    addM(7, nm, this.CompJScript(V, nm));
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) {
                    let nm = altProps[m[2]] || m[2], setter;
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript(V, nm);
                        if (/^on/.test(nm))
                            addM(5, nm, this.AddErrH(depV));
                        else
                            addM(1, nm, depV);
                    }
                    if (m[1] != '#') {
                        let dS = this.CompTarget(V), cnm;
                        setter = () => {
                            let S = dS();
                            return function () {
                                S(this[cnm || (cnm = ChkNm(this, nm))]);
                            };
                        };
                    }
                    if (/\*/.test(m[1]))
                        addM(9, nm, setter);
                    if (/\+/.test(m[1]))
                        addM(10, nm, setter);
                    if (/[@!]/.test(m[1]))
                        addM(5, /!!|@@/.test(m[1]) ? 'onchange' : 'oninput', setter);
                }
                else if (m = /^\.\.\.(.*)/.exec(nm)) {
                    if (V)
                        throw 'A rest parameter cannot have a value';
                    addM(8, nm, this.CompName(m[1]));
                }
                else if (nm == 'src')
                    addM(2, this.FilePath, this.CompString(V, nm));
                else
                    addM(0, nm, this.CompString(V, nm));
            }
            catch (err) {
                throw (`[${nm}]: ${err}`);
            }
        }
        atts.clear();
        return modifs;
    }
    CompString(data, nm) {
        let rIS = this.rIS || (this.rIS = new RegExp(/(\\[${])|/.source
            + (this.Settings.bDollarRequired ? /\$/ : /\$?/).source
            + /\{((\{(\{.*?\}|.)*?\}|'(\\'|.)*?'|"(\\"|.)*?"|`(\\`|.)*?`|\\\}|.)*?)\}|$/.source, 'gs')), gens = [], ws = nm || this.Settings.bKeepWhiteSpace ? 4 : this.ws, isTriv = T, bThis, lastIndex = rIS.lastIndex = 0, dep, m;
        while (T)
            if (!(m = rIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.slice(lastIndex, m.index) : N;
                if (fixed) {
                    fixed = fixed.replace(/\\([${}\\])/g, '$1');
                    if (ws < 4) {
                        fixed = fixed.replace(/[ \t\n\r]+/g, ' ');
                        if (ws <= 2 && !gens.length)
                            fixed = fixed.replace(/^ /, '');
                        if (this.rspc && !m[2] && rIS.lastIndex == data.length)
                            fixed = fixed.replace(/ $/, '');
                    }
                    if (fixed)
                        gens.push(fixed);
                }
                if (lastIndex == data.length)
                    break;
                if (m[2]) {
                    let getS = this.CompJScript(m[2], nm, '{}');
                    gens.push(getS);
                    isTriv = F;
                }
                lastIndex = rIS.lastIndex;
            }
        if (isTriv) {
            let s = gens.join('');
            (dep = () => s).fixed = s;
        }
        else
            dep =
                function () {
                    try {
                        let s = "";
                        for (let gen of gens)
                            s +=
                                typeof gen == 'string' ? gen
                                    : (bThis ? gen.call(this) : gen()) ?? '';
                        return s;
                    }
                    catch (err) {
                        throw nm ? `[${nm}]: ${err}` : err;
                    }
                };
        return dep;
    }
    CompPatt(patt, url) {
        let reg = '', lvars = [], regIS = /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;
        while (regIS.lastIndex < patt.length) {
            let ix = regIS.lastIndex, m = regIS.exec(patt), literals = patt.slice(ix, m.index);
            if (literals)
                reg += quoteReg(literals);
            reg +=
                m[1]
                    ? (lvars.push(this.newV(m[1])), `(.*?)`)
                    : m[0] == '?' ? '.'
                        : m[0] == '*' ? '.*'
                            : m[2] ? m[2]
                                : m[0];
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CompParam(atts, attName, bReq) {
        let v = atts.g(attName);
        return (v == N ? this.CompAttrExpr(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandlr(attName, v)
                : this.CompString(v, attName));
    }
    CompAttrExpr(atts, att, bReq, check) {
        return this.CompJScript(atts.g(att, bReq, T), att, U, check);
    }
    CompTarget(expr, nm) {
        try {
            return this.CompJScript(`$=>(${expr})=$`, nm);
        }
        catch (e) {
            throw `Invalid left-hand side ` + e;
        }
    }
    CompHandlr(nm, text) {
        return /^#/.test(nm) ? this.CompJScript(text, nm)
            : this.CompJScript(`function(event){${text}\n}`, nm);
    }
    CompJScript(expr, descrip, delims = '""', check) {
        if (expr == N)
            return N;
        try {
            let rout = gEval(`'use strict';(function expr([${this.ct}]){return(${expr}\n)})`);
            return function () {
                try {
                    let t = rout.call(this, env), m = check?.(t);
                    if (m)
                        throw m;
                    return t;
                }
                catch (e) {
                    throw `${descrip ? `[${descrip}] ` : ''}${delims[0]}${Abbr(expr)}${delims[1]}: ` + e;
                }
            };
        }
        catch (e) {
            throw `${descrip ? `[${descrip}] ` : ''}${delims[0]}${Abbr(expr)}${delims[1]}: ` + e;
        }
    }
    CompName(nm) {
        let k = this.ctMap.get(nm);
        if (k == N)
            throw `Unknown name '${nm}'`;
        return () => env[k];
    }
    compAttrExprList(atts, attName, bReacts) {
        let list = atts.g(attName, F, T);
        if (list == N)
            return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars.set(nm, F);
        return this.CompJScript(`[${list}\n]`, attName);
    }
    AddErrH(getHndlr) {
        return () => {
            let hndlr = getHndlr(), oE = onerr, oS = onsuc;
            return (hndlr && (oE || oS)
                ? function hError(ev) {
                    try {
                        let a = hndlr.call(this, ev);
                        if (a instanceof Promise)
                            return a.then(oS && (v => (oS(ev), v)), oE);
                        oS?.(ev);
                        return a;
                    }
                    catch (e) {
                        if (!oE)
                            throw e;
                        oE(e);
                    }
                }
                : hndlr);
        };
    }
    GetURL(src) {
        return new URL(src, this.FilePath).href;
    }
    GetPath(src) {
        return this.GetURL(src).replace(/[^/]*$/, '');
    }
    async FetchText(src) {
        return await (await RFetch(this.GetURL(src))).text();
    }
    async fetchModule(src) {
        let m = D.getElementById(src);
        if (!m) {
            let d = parser.parseFromString(await this.FetchText(src), 'text/html'), b = d.body, e = b.firstElementChild;
            if (e?.tagName != 'MODULE')
                return conc(d.head.childNodes, b.childNodes);
            m = e;
        }
        else if (m.tagName != 'MODULE')
            throw `#${src} must be a <MODULE>`;
        return m.childNodes;
    }
}
RCompiler.iNum = 0;
export async function RFetch(input, init) {
    let rp = await fetch(input, init);
    if (!rp.ok)
        throw `${init?.method || 'GET'} ${input} returned ${rp.status} ${rp.statusText}`;
    return rp;
}
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
class Atts extends Map {
    constructor(elm) {
        super();
        for (let a of elm.attributes)
            if (!/^_/.test(a.name))
                super.set(a.name, a.value);
    }
    g(nm, bReq, bHashAllowed) {
        let m = nm, v = super.get(m);
        if (v == N && bHashAllowed)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute [${nm}]`;
        return v;
    }
    gB(nm) {
        let v = this.g(nm), m = /^((false)|true)?$/i.exec(v);
        if (v != N) {
            if (!m)
                throw `@${nm}: invalid value`;
            return !m[2];
        }
    }
    NoneLeft() {
        super.delete('hidden');
        if (super.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}
let R = new RCompiler(), altProps = {
    "class": "className",
    for: "htmlFor"
}, genAtts = /^#?(?:((?:this)?reacts?on|on)|(?:(before)|on|after)((?:create|update|destroy)+)|on((error)-?|success))$/, reIdent = /^[A-Z_$][A-Z0-9_$]*$/i, reReserv = /^(break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/, reCap = /(accent|additive|align|angle|animation|ascent|aspect|auto|back(drop|face|ground)|backface|behavior|blend|block|border|bottom|box|break|caption|caret|character|clip|color|column(s$)?|combine|conic|content|counter|css|decoration|display|emphasis|empty|end|feature|fill|filter|flex|font|forced|frequency|gap|grid|hanging|hue|hyphenate|image|initial|inline|inset|iteration|justify|language|left|letter|line(ar)?|list|margin|mask|masonry|math|max|min|nav|object|optical|outline|overflow|padding|page|paint|perspective|place|play|pointer|rotate|position|print|radial|read|repeating|right|row(s$)?|ruby|rule|scale|scroll(bar)?|shape|size|snap|skew|skip|speak|start|style|tab(le)?|template|text|timing|top|touch|transform|transition|translate|underline|unicode|user|variant|variation|vertical|viewport|white|will|word|writing|^z)|./g, reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL|SELECT|TITLE)$/, reInline = /^(BUTTON|INPUT|IMG)$/, reWS = /^[ \t\n\r]*$/, Cnms = {};
function ChkId(nm) {
    if (!reIdent.test(nm))
        throw `Invalid identifier '${nm}'`;
    if (reReserv.test(nm))
        throw `Reserved keyword '${nm}'`;
    return nm;
}
function CapProp(nm) {
    let b;
    return nm.replace(reCap, (w, w1) => {
        let r = b ? w.slice(0, 1).toUpperCase() + w.slice(1) : w;
        b = w1;
        return r;
    });
}
function ChkNm(obj, nm) {
    if (Cnms[nm])
        return Cnms[nm];
    let c = nm, r = new RegExp(`^${nm}$`, 'i');
    if (!(nm in obj))
        for (let p in obj)
            if (r.test(p)) {
                c = p;
                break;
            }
    return Cnms[nm] = c;
}
function ErrMsg(elm, e, maxL) {
    return Abbr(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxL) + '> ' + e;
}
function Abbr(s, m = 60) {
    return s.length > m ?
        s.slice(0, m - 3) + "..."
        : s;
}
function LAbbr(s, m = 1000) {
    return s.length > m ?
        "... " + s.slice(s.length - m + 4)
        : s;
}
function mapNm(m, v) {
    m.set(v.nm, v);
}
function mapSet(m, nm, v) {
    if (v != N)
        m.set(nm, v);
    else
        m.delete(nm);
}
function* conc(R, S) {
    for (let x of R)
        yield x;
    for (let x of S)
        yield x;
}
function* mapI(I, f) {
    for (let x of I)
        yield f(x);
}
function* split(s) {
    if (s)
        for (let v of s.split(',')) {
            v = v.trim();
            if (v)
                yield v;
        }
}
function setWs(t, v) {
    t.ws = v;
    return t;
}
function createErrNode(msg) {
    let e = D.createElement('div');
    ass(e.style, { color: 'crimson', fontFamily: 'sans-serif', fontSize: '10pt' });
    e.innerText = msg;
    return e;
}
function NoChildren(srcElm) {
    for (let node of srcElm.childNodes)
        if (srcElm.childElementCount
            || node.nodeType == Node.TEXT_NODE && !reWS.test(node.nodeValue))
            throw `<${srcElm.tagName} ...> must be followed by </${srcElm.tagName}>`;
}
function copySSheets(S, D) {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules)
            DSheet.insertRule(rule.cssText);
    }
}
export function* range(from, count, step = 1) {
    if (count === U) {
        count = from;
        from = 0;
    }
    for (let i = 0; i < count; i++)
        yield from + i * step;
}
class DocLoc extends _RVAR {
    constructor() {
        super('docLocation', L.href);
        W.addEventListener('popstate', _ => this.V = L.href);
        let DL = this.Subscribe(loc => {
            let h = (this.url = new URL(loc)).href;
            h == L.href || history.pushState(N, N, h);
            ScrollToHash();
        }, T, T);
        this.query = new Proxy({}, {
            get(_, key) { return DL.url.searchParams.get(key); },
            set(_, key, val) { DL.V = DL.search(key, val); return true; }
        });
    }
    get subpath() { return L.pathname.slice(this.basepath.length); }
    set subpath(s) {
        this.url.pathname = this.basepath + s;
        this.V = this.url.href;
    }
    search(fld, val) {
        let U = new URL(this.V);
        mapSet(U.searchParams, fld, val);
        return U.href;
    }
    RVAR(fld, df, nm = fld) {
        let R = RVAR(nm, N, N, v => this.query[fld] = v);
        this.Subscribe(_ => R.V = this.query[fld] ?? df, T);
        return R;
    }
}
const DL = new DocLoc(), reroute = arg => {
    if (typeof arg == 'object') {
        if (arg.ctrlKey)
            return;
        arg.preventDefault();
        arg = arg.target.href;
    }
    DL.V = new URL(arg, DL.V).href;
};
export { DL as docLocation, reroute };
function ScrollToHash() {
    if (L.hash)
        setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6);
}
ass(G, { RVAR, range, reroute, RFetch });
if (/^rhtml$/i.test(D.body.getAttribute('type')))
    setTimeout(RCompile, 0);
