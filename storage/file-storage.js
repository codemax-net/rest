/**
* 	Generic JSON rest JSL3 - extension
*	 	
*	version	: 1.1 
*	author	: dr. G.Metaxas
* 	Copyright 2020 Ambianti B.V.
* 	
*	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and 
*	associated documentation files (the "Software"), to deal in the Software without restriction, 
*	including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
*	and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, 
*	subject to the following conditions:
*	
*	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*	
*	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
*	INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
*	IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
*	WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE 
*	SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*	
*/

/**
	Rundimental!!! use only for testing on local host
*/
const fs  = require('fs');
const tsRx=/T|\:|\-/g;
const dateToTimestampStr=(date)=>(date??new Date()).toISOString().substr(0,19).replace(tsRx,'');
module.exports=(path,readopt={},writeopt={flag:'w+'})=>({//storage	
	name:(()=>{
		return path;
	})(),
	loadData:async function(){
		return new Promise((resolve,reject)=>{
			fs.readFile(path,readopt||{},(err,buf)=>{
				if(err){
					reject(err);
				}else{
					resolve(buf);
				}
			})
		})
	},
	saveData:async function(data,ifGenerationMatch=true,metadata=undefined){
		return new Promise((resolve,reject)=>{
			fs.rename(path,`${path}.${dateToTimestampStr()}`,(err)=>{
				if(err){
					reject(err);
				}else{
					fs.writeFile(path,data,writeopt||{},(err)=>{
						if(err){
							reject(err);
						}else{
							resolve(true);
						}
					})
				}
			});			
		})
		this.data=Buffer.from(data);
		this.lastModified=new Date();
	},
	lastModified:new Date()
});	
