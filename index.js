const fs = require('fs');
const http = require('http');
const superagent = require('superagent');
const cheerio = require('cheerio');
const { Pool, Client } = require('pg');           // pg数据库
let schedule = require('node-schedule');          // 定时任务
// 定时执行爬虫任务
var j = schedule.scheduleJob({hour: 06, minute: 0, second: 0}, function(){
  getHomePage();
});
const basicUrl = 'http://health.sohu.com/';       // 搜狐健康

// 数据库配置
const config = {
    user:"postgres",
    database:"nursing_cloud_development",
    password:"pg!@#$",
    host: '101.200.174.126',
    port: 5432
}
const pool = new Pool(config);

let urls = [];                // 存储资讯url地址

// 爬取健康资讯首页
function getHomePage(){
  superagent.get(basicUrl).end(function (err, res) {
      // 抛错拦截
       if(err){
           throw Error(err);
       }
     /**
     * res.text 包含未解析前的响应内容
     * 我们通过cheerio的load方法解析整个文档，就是html页面所有内容，可以通过console.log($.html());在控制台查看
     */
     let $ = cheerio.load(res.text);
     urls = [];             // 重置urls
     // 取出 url列表
     $('#main-news div[data-role="news-item"]').each(function(i, o){
       if($(o).find('.pic.img-do').length > 0){               // 如果有主图
         let src;                                             // img的src
         let href = $(o).find('h4').find('a').attr('href');   // 详情页的链接
         var image = $(o).find('.pic.img-do img');            // 主图
         src = image.attr('data-src') ? image.attr('data-src') : image.attr('src');
         let img = 'http:' + src.slice(0, src.indexOf('.com/') + 5) + src.slice(src.indexOf('/images'));
         urls.push({
           url: href,
           img: img
         });
       }
     });
     if(urls.length == 0)return;
     // getDetail([urls[0], urls[1]]);           // 数据库存储资讯详情信息
     // saveImage(urls);                         // 保存图片

  });
}
// getHomePage();          // 爬取首页资讯的url，放在定时任务中执行

// 异步爬取详情页内容，存入数据库
async function getDetail(urls){
  const client = await pool.connect();              // 建立连接
  console.log('连接成功...', '共'+ urls.length +'条数据');
  let p = urls.map(function(o,i){
    return new Promise(function(resolve, reject){
      // 详情页
      superagent.get('http:' + o.url).end(function (err, res) {
        // 抛错拦截
        if(err){
          reject(err);
        }
        let $ = cheerio.load(res.text, {decodeEntities: false});
        $('#mp-editor [data-role="original-title"], #mp-editor #backsohucom, #mp-editor [data-role="editor-name"]').remove();    // 删除掉不需要的p标签
        let content = replaceText($.html('#mp-editor'));                // 富文本
        let name = $('.left.main .text-title h1').text();               // 标题
        try{
          let times = getTime('Y-m-d H:i:s');
          (async () => {
            const { rows } = await client.query('INSERT INTO news_informations(user_id, local_store_id, organization_id, category, source, name, content, created_at, updated_at, publish_time) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [1, 1, 1, 0, '搜狐健康', name, content, times, times, times]);
            // const { rows } = await client.query('SELECT *  FROM news_informations WHERE id = 213');
            // console.log(rows[0])
            console.log('插入成功', i);
            resolve();
          })();
        }catch (e) {
          reject(e);
        }

      });
    });
  });

  let results = await Promise.all(p);             // 多个请求并发
  client.release();
  console.log('数据库储存完成,连接关闭...');
}

// 异步保存图片文件
async function saveImage(urls){
  await hasDir('/', 'images');
  await hasDir('/images/', getTime('Ymd'));
  let p = urls.map(function(o, i){
    return new Promise(function(resolve, reject){

      http.get(o.img, function (res) {
        var imgData = "";
        res.setEncoding("binary"); //一定要设置response的编码为binary否则会下载下来的图片打不开
        res.on("data", function (chunk) {
          imgData += chunk;
        });
        res.on("end", function () {
          // console.log(imgData);
          fs.writeFile(__dirname + "/images/" + getTime('Ymd') + '/' + new Date().getTime() + ".png", imgData, "binary", function (err) {
            if (err) {
              console.log("保存失败", i);
              reject(err);
            }
            console.log("保存成功", new Date().getTime());
            resolve();
          });
        });
        res.on("error", function (err) {
          console.log("请求失败", i);
          reject(err);
        });
      });

    });
  });
  let results = await Promise.all(p);             // 多个请求并发
  console.log('全部图片保存成功了...');
}

// 判断是否存在该文件夹，如果不存在，新建
function hasDir(path, dirName){
  return new Promise(function(resolve, reject){
    fs.readdir(__dirname + path + dirName, function(err, res){
      if(res == undefined){
        // 没有该文件夹，创建
        fs.mkdir(__dirname + path + dirName, function(err){
          if(err){
            reject(err);
          }
          resolve();
        });
      }else{
        // 有该文件夹
        resolve();
      }
    });
  });
}


// 删除字符串中的回车
function replaceText(text){
    return text.replace(/\n/g, "");
}
// 格式化时间格式
function fix2number(n) {
    return [0,n].join('').slice(-2);
}
function getTime(format) {
    var curdate = new Date();
    if (format == undefined) return curDate;
    format = format.replace(/Y/i, curdate.getFullYear());
    format = format.replace(/m/i, fix2number(curdate.getMonth() + 1));
    format = format.replace(/d/i, fix2number(curdate.getDate()));
    format = format.replace(/H/i, fix2number(curdate.getHours()));
    format = format.replace(/i/i, fix2number(curdate.getMinutes()));
    format = format.replace(/s/i, fix2number(curdate.getSeconds()));
    format = format.replace(/ms/i, curdate.getMilliseconds());
    return format;
}
