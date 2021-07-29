let sampleGreeting=
`<define rvar='yourName' store=sessionStorage></define>
<p>
    What's your name?
    <input type=text @value="yourName.V">
</p>
<if cond="yourName.V">
    <p>
        Nice to meet you, {yourName.V}.
        <br>By the way, your name consists of {yourName.V.length} 
        characters.
    </p>
</if>`;

const sampleGreeting2 =
`<script type=module>
    // Create a "Reactive variable" with a global name and
    // an initial value
    RVAR('yourName', '', sessionStorage);
    /* Now 'yourName' has been added to the global environment,
    and 'yourName.V' refers to the value of the variable,
    so that assignments to this value can be tracked. */
</script>

<p>What's your name?
    <input type=text @value="yourName.V">
    <!-- The "@" introduces a two-way binding for the input element.
    Anytime an input event happens, 'yourName.V' will be updated,
    and the DOM as well  -->
</p>
<if cond="yourName.V" reacton=yourName>
    <p> Nice to meet you, {yourName.V}.
        <br>By the way, your name consists of {yourName.V.length} 
        characters.
    </p>
</if>`;

const sampleTableMaker =
`<component>
    <TABLEMAKER datasource>
        <HDEF></HDEF>
        <DDEF item></DDEF>
    </TABLEMAKER>

    <template>
        <table.>
            <tr.>
                <for of=HDEF>
                    <th.><HDEF></HDEF></th.>
                </for>
            </tr.>
            <for let=rec #of='datasource'>
                <tr.>
                    <for of=DDEF>
                        <td.><DDEF #item=rec></DDEF></td.>
                    </for>
                </tr.>
            </for>
        </table.>
    </template>
</component>

<!-- Some data -->
<script>
    globalThis.data = [
        {name:'Piet', age:18}, 
        {name:'Tine', age:19}
    ];
</script>

<!-- Now the actual table definition: -->
<tablemaker #datasource='globalThis.data'>
    <!-- First column -->
    <HDEF>Naam</HDEF>
    <DDEF item>\{item.name\}</DDEF>

    <!-- Second column -->
    <HDEF>Leeftijd</HDEF>
    <DDEF item=record>{record.age}</DDEF>
</tablemaker>`;

let sampleTicTacToe = 
`<script type=module>
    function Board() {
        function Cell() {return {V: null}; }
        function Row()  {return [Cell(), Cell(), Cell()]; }
        return [Row(), Row(), Row()]; 
    }

    globalThis.TicTacToe = class TicTacToe {
        board =     RVAR('board');
        toMove =    RVAR('toMove', '✕');
        winner =    RVAR('winner');
        count = 0;

        ClearAll() {
            this.board.V = Board();
            this.winner.V = null;
            this.count = 0;
        }
        constructor() {
            this.ClearAll();
        }

        Move(cell) {
            cell.U.V = this.toMove.V;
            this.count++;
            this.toMove.V = (this.toMove.V=='✕' ? '◯' : '✕');
            this.winner.V = this.CheckWinner(this.board.V) || this.count==9;
        }

        CheckWinner(b) {
            function CheckRow(c1, c2, c3) {
                return (c1.V && c1.V == c2.V && c2.V == c3.V
                    ? c1.V : null);
            }
            let w = null;
            for (let i=0;i<3;i++) {
                w ||= CheckRow(...b[i]);
                w ||= CheckRow(b[0][i], b[1][i], b[2][i]);
            }
            for (let i=-1;i<2;i+=2)
                w ||= CheckRow(b[0][1+i], b[1][1], b[2][1-i]);
            return w;
        }
    }
</script>

<style>
    .tic-tac-toe td {
        height:32pt;width: 32pt; 
        border: 2px solid; 
        text-align: center; vertical-align: middle;
    }
</style>

<div style="display: grid; width: 300pt; background-color: white;">
    <div style="grid-area: 1/1 / 1/span 2; text-align: center;">
        <b>Tic-Tac-Toe</b>
    </div>

    <define var=T value="new TicTacToe()"></define>
    <table. class=tic-tac-toe reacton=T.board
            style="grid-area: 2/1; width: fit-content; margin:1ex">
        <for let=row #of="T.board.V">
            <tr.>
                <for let=cell #of=row updates=T.board>
                    <td. onclick="!T.winner.V && !cell.V && T.Move(cell)"
                    >{cell.V ?? ''}</td.>
                </for>
            </tr.>
        </for>
    </table.>
    <div style="grid-row: 2; grid-column: 2;">
        <p reacton=T.winner,T.toMove>
            <case>
                <when #cond="T.winner.V==true">
                    <b>It's a draw.</b>
                </when>
                <when #cond="T.winner.V">
                    <b>The winner is: <large>{T.winner.V}</large></b>
                </when>
                <else>
                    Player to move: {T.toMove.V}
                </else>
            </case>
        </p>
        <button onclick="T.ClearAll()">Clear</button>
    </div>
</div>`;