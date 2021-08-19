const sampleGreeting=
`<define rvar='yourName' store=sessionStorage></define>
<p>
    What's your name?
    <input type=text @value="yourName.V">
</p>
<if cond="yourName.V">
    <p>
        Nice to meet you, {yourName.V}.
        <br>By the way, your name consists of {yourName.V.length} characters.
    </p>
</if>`;

const ColorTableDefs =
`<script nomodule defines="ColorTable,toHex" >
// Here we store the data. Columns are:
// name:string, red:number, green:number, blue:number.
const ColorTable = RVAR('', []);

/* Fetch the data! */
fetch("webColors.json").then(async response => {
    if (response.ok)
        ColorTable.V = JSON.parse(await response.text());
});

/* Utility for 2-digit hex code */
function toHex(n){ 
  return n.toString(16).toUpperCase().padStart(2,'0');
}
</script>

<style> /* Styling */
table.colorTable td {
  padding: 0px 4px;
  text-align: center;
  max-width: 8em; overflow:hidden;
}
</style>`;

const sampleServerData =
`${ColorTableDefs}

<div style="height:50ex; overflow-y:scroll;">
  <!-- Now we build our table! 
    The dots are needed because HTML does not allow <FOR> as a
    child of <TABLE>. OtoReact removes these dots. -->
  <table. class=colorTable>
    <!-- Table caption -->
    <caption.>Web Colors</caption.>
    <!-- Column headers -->
    <tr.>
      <th.>Name</th.>
      <th.>R</th.><th.>G</th.><th.>B</th.>
      <th.>Hex</th.>
    </tr.>
    <!-- Detail records -->
    <FOR let=C of="ColorTable.V">
      <tr. 
           style.backgroundColor="rgb({C.red},{C.green},{C.blue})" 
           #style.color="C.green<148 ? 'white' : 'black'">
        <td.>{C.name}</td.>
        <td.>{C.red}</td.><td.>{C.green}</td.><td.>{C.blue}</td.>
        <td.>
          #{toHex(C.red) + toHex(C.green) + toHex(C.blue)}
        </td.>
      </tr.>
    </FOR>
  </table.>
</div>`;

const sampleBraces =
`1 + 1 = {1 + 1}  \\{ Check this }
<br>Tag <{}br> looks better in source code than &lt;br&gt;`;

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
<if cond="yourName.V">
  <p> Nice to meet you, {yourName.V}.
    <br>By the way, your name consists of {yourName.V.length} 
        characters.
  </p>
</if>`;

const sampleSqrt=
`<define rvar=x #value=2></define>
<p  title="sqrt({x.V}) = {Math.sqrt(x.V)}"
>
    What is sqrt({x.V})? Check the tooltip.
</p>
<button onclick="x.V += 1">Increment</button>`;

const sampleInlineStyles=
`<p style.backgroundColor=lightgrey> Light grey </p>

<define var=color value="red"></define>
<p #style.backgroundColor="color"> Colored </p>

<define var=myStyle 
  #value="{color: 'blue',fontStyle: 'italic'}"
></define>
<p +style="myStyle">My style</p>`;

const sampleParticipants=
`<!-- Here we use a local RVAR -->
<define rvar=Participants #value="['Joe', 'Mary', 'Eileen']"></define>

<p><b>Participants:</b></p>
<ul>
    <for let=participant #of="Participants.V">
        <li>{participant}</li>
    </for>
</ul>
<p>
    New participant (Enter):
    <br>
    <input type=text onchange="
        if(this.value) {
            Participants.U.push(this.value); this.value=''; 
        }
    ">
<!-- "this" in all RHTML event handlers refers to the target element.
  Getting "Participants.U" means "Participants" will be marked as
  changed, even though it is not assigned to. -->
</p>`;

const sampleTODO=
`<script nomodule defines=AddItem>
    // Define the data model of our todo list
    let TODO = RVAR('TODO',
        [['Visit Joe', true], ['Fishing',false], ['Sleeping',false]]
    );
    // Adding an item
    function AddItem(inputElement) {
        if (inputElement.value) {
            TODO.U.push( [inputElement.value, false] );
            inputElement.value = '';
        }
    }
</script>

<!-- Define a component, showing a filtered list of to-do-items, 
with a caption -->
<component>
    <!-- This is the component signature -->
    <itemlist caption bDone></itemlist>

    <template>
        <p><b>{caption}</b></p>
        <p>
            <for let=item of=TODO.V updates=TODO>
                <!-- 'bdone' must be in lowercase -->
                <if cond='item[1] == bdone'>
                    <label>
                        <input type=checkbox @checked='item.U[1]'> 
                        {item[0]}
                    </label>
                    <br>
                </if>
            </for>
        </p>
    </template>
</component>

<!-- These elements should react on changes in RVAR 'TODO' -->
<react on='TODO'>
    <itemlist caption='To do:' #bDone=false></itemlist>
    <itemlist caption='Done:'  #bDone=true ></itemlist>
</react>
<p>
    New item (Enter):
    <br>
    <input type=text onchange="AddItem(this)">
</p>`;

const sampleRecursion=
`<component>
<showList #arg></showList>
<style>
    .flex-container {
        display: flex; flex-wrap: wrap; align-items: center;
        background-color: gray;
    }
    .flex-container > div {
        background-color: #f1f1f1;
        margin: 4px; padding: 8px; font-size: 18px;
    }
</style>

<template>
    <case>
        <when #cond="Array.isArray(arg)">
            <div class=flex-container>
                <for let=item #of=arg>
                    <div>
                        <!-- Recursive invocation -->
                        <showList #arg=item></showList>
                    </div>
                </for>
            </div>
        </when>
        <else>
            {arg}
        </else>
    </case>
</template>
</component>   

<define rvar=list 
    value="[1, [2,3,4], [[41,42],5], 'Otolift']"
    store=sessionStorage
></define>
<p>JavaScript list: <input type=text @value="list.V" size=40></p>
<showList #arg="eval(list.V)"></showList>
<p>You can modify the list definition above and see the result.</p>`;

const sampleRedefineA =
`<component>
<a href #target? ...rest><content></content></a>
<template><a. #href="href"
    #target="!target && /^http/i.test(href) ? '_blank' : target"
    ...rest
    ><content></content></a.
></template>
</component>

This link opens in a blank window:
<a href="https://www.otolift.com/">Otolift Stairlifts</a>`;

const sampleTableMaker =
`<component>
    <TABLEMAKER datasource ...rest>
        <HDEF></HDEF>
        <DDEF item></DDEF>
    </TABLEMAKER>

    <template>
        <table. ...rest>
            <tr.>
                <for of=HDEF>
                    <th.><HDEF></HDEF></th.>
                </for>
            </tr.>
            <for let=rec of='datasource'>
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
<script nomodule defines=tableData>
    const tableData = [
        {name:'Piet', age:18}, 
        {name:'Tine', age:19}
    ];
</script>

<!-- Now the actual table definition: -->
<tablemaker #datasource='tableData'>
    <!-- First column -->
    <HDEF>Naam</HDEF>
    <DDEF item>{item.name}</DDEF>

    <!-- Second column -->
    <HDEF>Leeftijd</HDEF>
    <DDEF item=record>{record.age}</DDEF>
</tablemaker>`;

const sampleTMColor=
`${ColorTableDefs}

<div style="height:55ex; overflow-y:scroll;">
  <!-- Now we build our table! -->
  <TABLEMAKER #datasource="ColorTable.V" class=colorTable>
    <hdef>Name</hdef><ddef item=C>{C.name}</ddef>
    <hdef>R</hdef><ddef item=C>{C.red}</ddef>
    <hdef>G</hdef><ddef item=C>{C.green}</ddef>
    <hdef>B</hdef><ddef item=C>{C.blue}</ddef>
    <hdef>Hex</hdef><ddef item=C>#{toHex(C.red) + toHex(C.green) + toHex(C.blue)}</ddef>
  </TABLEMAKER>
</div>
`;

const sampleTicTacToe = 
`<script nomodule type=module defines=TicTacToe>
    function Board() {
        function Cell() {return {V: null}; }
        function Row()  {return [Cell(), Cell(), Cell()]; }
        return [Row(), Row(), Row()]; 
    }

    class TicTacToe {
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
        height:45px; width: 45px; padding: 0px;
        border: 2px solid; 
        text-align: center; vertical-align: middle;
    }
</style>

<div style="display: grid; background-color: white; grid-template-columns: auto 120pt">
    <div style="grid-area: 1/1 / 1/span 2; text-align: center;">
        <b>Tic-Tac-Toe</b>
    </div>

    <define var=T #value="new TicTacToe()"></define>
    <table. class=tic-tac-toe reacton=T.board
            style="width: 110pt; margin:1ex">
        <for let=row #of="T.board.V">
            <tr.>
                <for let=cell #of=row updates=T.board>
                    <td. onclick="!T.winner.V && !cell.V && T.Move(cell)"
                    >{cell.V ?? ''}</td.>
                </for>
            </tr.>
        </for>
    </table.>
    <div style="padding:1ex">
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

const sampleRHTML =
`<define rvar=sourceCode 
        value="1 + 1 = \\{1+1}"
        store=sessionStorage
></define>
<textarea @value="sourceCode.V" rows=3 cols=30></textarea>
<br>
<RHTML>
    {sourceCode.V}
</RHTML>`;