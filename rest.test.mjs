import fetch from 'node-fetch';
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const restApiInit=require("./rest.js");
const jpath=require('@codemax/jpath');
const express=require('express');
const app=express();
app.use(express.text({limit: '50kb', type:'text/*'})); // for parsing text/plain 
app.use(express.json({limit: '4mb',strict:false})); // for parsing application/json 
app.use(express.urlencoded({limit: '4mb',extended:true}));

const FG_RESET 	='\x1b[0m';			
const FG_BLACK 	='\x1b[30m';	//BG 40,  bright fg 90  bright(gray) bg 100
const FG_RED	='\x1b[31m';
const FG_GREEN 	='\x1b[32m';
const FG_YELLOW	='\x1b[33m'	, FG_YELLOW_BRIGHT	='\x1b[93m';
const FG_BLUE  	='\x1b[34m'	, FG_BLUE_BRIGHT	='\x1b[94m';

async function asyncAssertTrue(title,fn){
	if(!fn){
		fn=title;
		title='';
	};
	console.log('');
	if(title){
		console.log(FG_YELLOW,title,FG_RESET);		
	};
	const ret=await fn();	
	if(!ret){
		console.log(FG_RED,'assertTrue',FG_RESET,fn.toString(), '\n',FG_RED,'failed',FG_RED,ret,FG_RESET);
		process.exit(-1);
	}else{
		console.log(FG_GREEN,'assertTrue',FG_RESET,fn.toString(), '\n',FG_GREEN,'passed',FG_YELLOW_BRIGHT, ret, FG_RESET);
	}
}

async function asyncAssertFalse(title,fn){
	if(!fn){
		fn=title;
		title='';
	};
	console.log('');
	if(title){
		console.log(FG_YELLOW,title,FG_RESET);		
	};
	const err=await fn();	
	if(err){
		console.log(FG_RED,'assertFalse',FG_RESET,fn.toString(), '\n',FG_RED,'failed',FG_RED,err,FG_RESET);
		process.exit(-1);
	}else{
		console.log(FG_GREEN,'assertFalse',FG_RESET,fn.toString(), '\n',FG_GREEN,'passed',FG_YELLOW_BRIGHT,err,FG_RESET);
	}
}

const colors_json={
	"red":{
		"id" :"red",
		"hex":"#ff0000",
		"rgb":[255,0,0],
		"hsl":[0,100,50]
	},
	"green":{
		"id" :"green",
		"hex":"#00ff00",
		"rgb":[0,255,0],
		"hsl":[120,100,50]
	},
	"blue":{
		"id" :"blue",
		"hex":"#0000ff",
		"rgb":[0,0,255],
		"hsl":[240,100,50]
	}
};
const colors_store={//storage
	loadData:async function(){
		return (this.data||=JSON.stringify(colors_json));
	},
	saveData:async function(data){
		//console.log('saving data',data);
		this.data=data;
	},
	name:'colors.json'
};	
const initTestDatasetAPI=async function(){
	return await restApiInit(colors_store,{//data format
		'*':{
			id	:jpath.ID(),
			hex	:/^\#[0-9a-f]{6}$/,
			rgb :[jpath.limit(Number,0,255),jpath.limit(Number,0,255),jpath.limit(Number,0,255)],
			hsl :[jpath.limit(Number,0,360),jpath.limit(Number,0,100),jpath.limit(Number,0,100)]
		}
	});
};

const colorAPI=await initTestDatasetAPI();
app.use('/colors',colorAPI);

app.listen(3030);
console.log('Testing API');

//
await asyncAssertFalse('Testing get',async function(){	
	const response=await fetch( `http://localhost:3030/colors` ).then(res=>res.json());
	return jpath.valueTest(colors_json)(response);
});

await asyncAssertFalse('Testing GET with path',async function(){	
	const response=await fetch( `http://localhost:3030/colors/red` ).then(res=>res.json());
	return jpath.valueTest(colors_json.red)(response);
});

await asyncAssertFalse('Testing GET with filters',async function(){	
	const response=await fetch( `http://localhost:3030/colors?id=red&id=blue` ).then(res=>res.json());
	//console.log(response);
	return jpath.valueTest([colors_json.red,colors_json.blue])(response);
});


await asyncAssertFalse('Testing GET with filter',async function(){	
	const response=await fetch( `http://localhost:3030/colors?rgb=${encodeURIComponent('255,0,0')}` ).then(res=>res.json());
	//console.log(response);
	return jpath.valueTest([colors_json.red])(response);
});


//
await asyncAssertTrue('Testing PUT',async function(){	
	const response=await fetch( `http://localhost:3030/colors/red/description` ,{
		method	:'PUT',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json'},
		body	:'nice color'	
	}).then(res=>res.json());
	return response=='nice color';
});	

//
await asyncAssertFalse('Testing POST',async function(){	
	const yellow={id:'yellow',hex:'#ffff00',rgb:[255,255,0],hsl:[60,100,50]};
	const response=await fetch( `http://localhost:3030/colors` ,{
		method	:'POST',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(yellow)
	}).then(res=>res.json());
	const colors=JSON.parse(colors_store.data);
	return jpath.valueTest(colors.yellow)(yellow);
});

//
await asyncAssertTrue('Testing DELETE',async function(){	
	console.log(colors_store);
	const response=await fetch( `http://localhost:3030/colors/yellow` ,{method:'DELETE'});
	console.log(response.status,response.statusText);
	if(!response.status==204){
		return false;
	};
	const colors=JSON.parse(colors_store.data);
	return colors.yellow===undefined;
});


//
await asyncAssertFalse('Testing PATCH',async function(){	
	const patch={
		description:'nice color',
		composition:'mostly red'
	};
	const res=await fetch( `http://localhost:3030/colors/red` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(patch)
	});
	if(res.ok){
		const result=await res.json();
		const colors=JSON.parse(colors_store.data);
		console.log(result);
		return jpath.all(colors.red,patch)(result);
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};

});

await asyncAssertFalse('Testing PATCH with filter',async function(){	
	const patch={
		description:'very nice color',
		composition:'primary'
	};
	const res=await fetch( `http://localhost:3030/colors?id=red&id=green` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(patch)
	});
	if(res.ok){
		const result=await res.json();
		const colors=JSON.parse(colors_store.data);
		console.log(result);
		return jpath.all([colors.red,colors.green],[,,patch])(result);	
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});

//
await asyncAssertTrue('Testing MOVE with json',async function(){	
	//should return 409 because red exists
	const res=await fetch( `http://localhost:3030/colors/green` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify({id:'red'})
	});
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(colors_store.data);
		console.log(entity);
		return colors.green || jpath.all(colors.lime,{id:'lime'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});
await asyncAssertFalse('Testing MOVE with json',async function(){	
	const res=await fetch( `http://localhost:3030/colors/green` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify({id:'lime'})
	});
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(colors_store.data);
		console.log(entity);
		return colors.green || jpath.all(colors.lime,{id:'lime'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});


//
await asyncAssertFalse('Testing MOVE with plain text',async function(){	
	//should return 409 because red exists
	const res=await fetch( `http://localhost:3030/colors/lime` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json'},
		body	:'green'
	});
	//console.log(res);
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(colors_store.data);
		console.log(entity);
		return colors.lime || jpath.all(colors.green,{id:'green'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};	
});

await asyncAssertTrue('Testing MOVE with plain text',async function(){	
	const res=await fetch( `http://localhost:3030/colors/red` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json'},
		body	:'green'
	});
	//console.log(res);
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(colors_store.data);
		console.log(entity);
		return colors.lime || jpath.all(colors.green,{id:'green'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};	
});

process.exit(0);