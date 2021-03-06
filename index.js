const { printSchema } = require("graphql");
const { ApolloServer } = require("apollo-server");
const convertSchema = require("./convertSchema");
const createResolvers = require("./createResolvers");
const airtable = require("airtable");
const fs = require('fs');
const fetch = require('node-fetch');
const e = require("express");
// const { resolve } = require("path");

const savedTLEmptyStruct = `{"people": [], "toys": [], "companies": [], "date": ""}`;


class AirtableGraphQL {

  getCache(){
    console.log("getting cache start");
    //if doesnt exist, create with empty structure
    if(!(fs.existsSync("./cacheTL.json"))){
      console.log("creating file for cache");
      fs.writeFileSync("./cacheTL.json",savedTLEmptyStruct,function(err){
        if(err){
          console.log(err);
        }
      });
    }

    let savedTLTxt = JSON.parse(fs.readFileSync("./cacheTL.json"));
    console.log("got cache data");
    return savedTLTxt;
  }

  queryTL(){
    console.log("querying timeline data");

    return new Promise((resolve,reject) => {
      fetch("http://localhost:4000/",{
        method:'POST',
        headers:{
          'Content-Type': 'application/json'
        },
        body:JSON.stringify({
          "operationName":null,
          "variables":{},
          //this is the long query code that takes forever to load currently 
          "query":"{\n people{id\n    end\n\    name\n    visible\n    media\n   start\n  description\n  __typename\n \n toys{id\n name\n visible\n} \n companies{id\n name\n visible\n} },\n toys{id\n    end\n\    name\n    visible\n    media\n   start\n  description\n  __typename\n \n companies{id\n name\n visible\n} \n people{id\n name\n visible\n} },\n companies{id\n visible\n  end\n\   name\n   media\n   start\n  description\n  __typename\n  \n toys{id\n name\n visible\n} \n people{id\n name\n visible\n} }\n}\n",

        })
      })
      .then(data => {
        console.log("updated cache");
        return resolve(JSON.parse(fs.readFileSync("./cacheTL.json")));
      });
    })
  }

  //function i was using to try to mitigate the querying time issue it works but it still takes about the smae time and beacuase im pusing onece per promise each one erases the array created by the last promise 

  // queryTL(){
  //   console.log("testing my new query/ querying data");
  //   return Promise.all([promise1,promise2,promise3]).then(values => {
  //     console.log("updated cache");
  //     //try putting this insde of all three promises tomorow
  //     return JSON.parse(fs.readFileSync("./cacheTL.json"));
  //   })
  // }


  constructor(apiKey, config = {}) {
    this.columns = {};
    airtable.configure({ apiKey });
    const schema = JSON.parse(fs.readFileSync(config.schemaPath || "./schema.json", "utf8"));

    var normalizedPath = require("path").join(__dirname, "columns");
    require("fs")
      .readdirSync(normalizedPath)
      .forEach(file => {
        require("./columns/" + file)(this);
      });

    this.api = airtable.base(schema.id);
    this.schema = convertSchema(schema, this.columns);

    this.resolvers = createResolvers(
      schema,
      this.api,
      this.columns
    );

    this.server = new ApolloServer({
      typeDefs: printSchema(this.schema),
      resolvers: this.resolvers,
      playground: config.playground,
      introspection: true,
      plugins: [
        {requestDidStart({request}){
        return {
            willSendResponse({response}) {
              console.dir("active-1")
              //parse/save response here - if here, means there was a query, no cache
              let oldResponse = {
                "people": [],
                "toys": [],
                "companies": [],
                "date": ""
              };
              let dataPeople = "";
              let dataToys = "";
              let dataCompanies = "";

              if (response.data.people !== undefined) {
                dataPeople = response.data.people;
              }
              if (response.data.toys !== undefined) {
                dataToys = response.data.toys;
              }
              if (response.data.companies !== undefined) {
                dataCompanies = response.data.companies;
              }
              
              function visibleFilter(value){
                return value.visible == true
              }

              for (let i = 0; i < dataPeople.length; i++) {
                //timeline people data
                
                oldResponse.people.push({
                  "text": {
                    "headline": "",
                    "text": ""
                  },
                  "start_date": {
                    "year": ""
                  },
                  "end_date": {
                    "year": ""
                  },
                  "unique_id": "",
                  "group": "person",
                  "media": {
                    "url": ""
                  },
                  "toys": {
                    "tLinker": []
                  },
                  "companies": {
                    "cLinker": []
                  },
                  "visible":""
                });

                oldResponse.people[i].text.headline = dataPeople[i].name;
                oldResponse.people[i].text.text = '<p>'+ dataPeople[i].description +'</p>' 
                oldResponse.people[i].start_date.year = dataPeople[i].start;
                oldResponse.people[i].unique_id = dataPeople[i].id;
                oldResponse.people[i].media.url = dataPeople[i].media;

                if (dataPeople[i].end == null) {
                  oldResponse.people[i].end_date = undefined;
                } else {
                  oldResponse.people[i].end_date.year = dataPeople[i].end;
                }

                if (!Array.isArray(dataPeople[i].toys) ||!dataPeople[i].toys.length) {
                  oldResponse.people[i].toys = undefined;
                } else {
                  for (let t = 0; t < dataPeople[i].toys.length; t++) {
                    if(dataPeople[i].toys[t].visible){
                    oldResponse.people[i].toys.tLinker.push(dataPeople[i].toys[t].name);
                    }
                  }
                  oldResponse.people[i].text.text += " <br />" + '<span>' + "Toys: "+ oldResponse.people[i].toys.tLinker.toString() + '</span>'
                }

                if (!Array.isArray(dataPeople[i].companies) ||!dataPeople[i].companies.length) {
                  oldResponse.people[i].companies = undefined;
                } else {
                  for (let t = 0; t < dataPeople[i].companies.length; t++) {
                    if(dataPeople[i].companies[t].visible){
                      oldResponse.people[i].companies.cLinker.push(dataPeople[i].companies[t].name);
                    }
                    
                  }
                  oldResponse.people[i].text.text += " <br />" + '<span>' + "Companies: "+ oldResponse.people[i].companies.cLinker.toString() + '</span>'
                }
                oldResponse.people[i].visible = dataPeople[i].visible;
              }
              
              console.dir("finished people");
              
              for (let x = 0; x < dataToys.length; x++) {
                //timeline toys data
                oldResponse.toys.push({
                  "text": {
                    "headline": "",
                    "text": ""
                  },
                  "start_date": {
                    "year": ""
                  },
                  "end_date": {
                    "year": "",
                  },
                  "unique_id": "",
                  "group": "toys",
                  "media": {
                    "url": "",
                  },
                  "people": {
                    "pLinker": []
                  },
                  "companies": {
                    "cLinker": []
                  },
                  "visible":"",

                });
                
                oldResponse.toys[x].text.headline = dataToys[x].name;
                oldResponse.toys[x].text.text = '<p>'+dataToys[x].description+'</p>';

                if (dataToys[x].start == null) {
                  oldResponse.toys[x].start_date.year = "1910";
                } else {
                  oldResponse.toys[x].start_date.year = dataToys[x].start;
                }

                if (dataToys[x].end == null) {
                  oldResponse.toys[x].end_date = undefined;

                } else {
                  oldResponse.toys[x].end_date.year = dataToys[x].end;
                }

                if (dataToys[x].media == null) {
                  oldResponse.toys[x].media.url = "https://cdn2.iconfinder.com/data/icons/image-1/64/Image-12-512.png"
                } else {
                  oldResponse.toys[x].media.url = dataToys[x].media;
                }

                oldResponse.toys[x].unique_id = dataToys[x].id;

                if (!Array.isArray(dataToys[x].people) || !dataToys[x].people.length) {
                  oldResponse.toys[x].people = undefined;
                } else {
                  for (let t = 0; t < dataToys[x].people.length; t++) {
                    if(dataToys[x].people[t].visible){
                      oldResponse.toys[x].people.pLinker.push(dataToys[x].people[t].name);
                    }
                  }
                  oldResponse.toys[x].text.text += " <br />" + '<span>' + "People: "+  oldResponse.toys[x].people.pLinker.toString() + '</span>'
                }

                if (!Array.isArray(dataToys[x].companies) || !dataToys[x].companies.length)  {
                  oldResponse.toys[x].companies = undefined;
                } else {
                  for (let t = 0; t < dataToys[x].companies.length; t++) {
                    if(dataToys[x].companies[t].visible){
                    oldResponse.toys[x].companies.cLinker.push(dataToys[x].companies[t].name);
                    }
                  }
                  oldResponse.toys[x].text.text += " <br />" + '<span>' + "Companies: "+  oldResponse.toys[x].companies.cLinker.toString() + '</span>'
                }
                oldResponse.toys[x].visible = dataToys[x].visible;
              }
              console.dir("finished toys");

              for (let y = 0; y < dataCompanies.length; y++) {
                //timeline companies data

                oldResponse.companies.push({
                  "text": {
                    "headline": "",
                    "text": ""
                  },
                  "start_date": {
                    "year": ""
                  },
                  "end_date": {
                    "year": ""
                  },
                  "unique_id": "",
                  "group": "companies",
                  "media": {
                    "url": ""
                  },
                  "people": {
                    "pLinker": []
                  },
                  "toys": {
                    "tLinker": []
                  },
                  // "companiesToName": "",
                  "visible":"",
                });

                // let tester = [];
                oldResponse.companies[y].text.headline = dataCompanies[y].name;
                oldResponse.companies[y].text.text = '<p>'+dataCompanies[y].description+'</p>';
                if (dataCompanies[y].start == null) {
                  oldResponse.companies[y].start_date.year = "1910";
                } else {
                  oldResponse.companies[y].start_date.year = dataCompanies[y].start;
                }

                if (dataCompanies[y].end == null) {
                  oldResponse.companies[y].end_date = undefined;
                } else {
                  oldResponse.companies[y].end_date.year = dataCompanies[y].end;
                }

                if (dataCompanies[y].media == null) {
                  oldResponse.companies[y].media.url = "https://cdn2.iconfinder.com/data/icons/image-1/64/Image-12-512.png"
                } else {
                  oldResponse.companies[y].media.url = dataCompanies[y].media;
                }

                oldResponse.companies[y].unique_id = dataCompanies[y].id;

                if (!Array.isArray(dataCompanies[y].people)||!dataCompanies[y].people.length) {
                  oldResponse.companies[y].people = undefined;
                } else {
                  for (let t = 0; t < dataCompanies[y].people.length; t++) {
                    if(dataCompanies[y].people[t].visible){
                      oldResponse.companies[y].people.pLinker.push(dataCompanies[y].people[t].name);
                    }
                  }
                  oldResponse.companies[y].text.text += " <br />" + '<span>' + "People: "+  oldResponse.companies[y].people.pLinker.toString() + '</span>'
                }


                if (!Array.isArray(dataCompanies[y].toys)||!dataCompanies[y].toys.length) {
                  oldResponse.companies[y].toys = undefined;
                } else {
                  for (let t = 0; t < dataCompanies[y].toys.length; t++) {
                    if(dataCompanies[y].toys[t].visible){
                      oldResponse.companies[y].toys.tLinker.push(dataCompanies[y].toys[t].name);
                    }
                  }
                  oldResponse.companies[y].text.text += " <br />" + '<span>' + "Toys: "+  oldResponse.companies[y].toys.tLinker.toString() + '</span>'
                }
                oldResponse.companies[y].visible = dataCompanies[y].visible;
              }
              console.dir("finished companies");

              //these filter out any thing that does not have the visible attribute 
              let filteredPeople = oldResponse.people.filter(visibleFilter);
              let filtredToys = oldResponse.toys.filter(visibleFilter);
              let filtredCompanies = oldResponse.companies.filter(visibleFilter);

              oldResponse.people = filteredPeople;
              oldResponse.toys = filtredToys;
              oldResponse.companies = filtredCompanies;

              oldResponse.date = new Date();

              let savedTL = JSON.stringify(oldResponse);
              console.log("updateing cache");
              fs.writeFileSync("./cacheTL.json", savedTL, function (err) {
                if (err) {
                  console.log(err);
                }
              });
            },
          };
        }
      }]
    });
    }

  addColumnSupport(columnType, config) {
    this.columns = {
      ...this.columns,
      [columnType]: config
    };
  }

  async listen(options) {
    this.server.listen(options).then(({ url }) => {
      console.log(`🚀  Server ready at ${url}`);
    });
  }
}

module.exports = AirtableGraphQL;
