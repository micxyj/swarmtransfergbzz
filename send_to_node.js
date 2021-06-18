// import dependencies
const Wallet = require('ethereumjs-wallet');
const aws = require('aws-sdk');
const Web3 = require("web3");
const fs = require("fs");
const path = require('path');


// define wallet config
const network = "goerli";
const infuraProjectId = "";
const contractAddress = "";
const walletPrivateKey = "";
const fromWalletAddress = "";
var amount = 1;


// define aws config
var awsRegion = "";
var tableName = "";
aws.config.update({
    region: awsRegion
});
var client = new aws.DynamoDB.DocumentClient();


// read ddb and get message of private key, node address, password
async function getNodeMsg(tableName) {
    var params = {
        TableName: tableName,
    };
    console.log("Scanning Movies table.");
    var nodeMsgs = new Array();
    data = await client.scan(params).promise();
    data.Items.forEach(function (msg) {
        nodeMsgs.push(msg);
    });
    if (typeof data.LastEvaluatedKey != "undefined") {
        console.log("Scanning for more...");
        params.ExclusiveStartKey = data.LastEvaluatedKey;
        data = await client.scan(params).promise();
        data.Items.forEach(function (msg) {
            nodeMsgs.push(msg);
        });
    }
    return new Promise((resolve) => {
        resolve(nodeMsgs);
    })
}

function getWeb3Instance(privateKey) {
    let web3 = new Web3(new Web3.providers.HttpProvider(`https://${network}.infura.io/v3/${infuraProjectId}`));
    const signer = web3.eth.accounts.privateKeyToAccount(privateKey);
    web3.eth.accounts.wallet.add(signer);
    return web3;
}

function getContract(fromAddress, privateKey) {

    let web3 = getWeb3Instance(privateKey);
    var abiArray = JSON.parse(fs.readFileSync(path.join(__dirname, "./gbzz_abi.json")));
    var contract = new web3.eth.Contract(abiArray, contractAddress, { from: fromAddress });
    return contract;
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

async function transferToken(privateKey, fromAddress, toAddress, nonce, amount) {
    var web3 = getWeb3Instance(privateKey);
    var contract = getContract(fromAddress, privateKey);
    const tx = {
        from: fromAddress,
        to: contractAddress,
        value: 0x0,
        data: contract.methods.transfer(toAddress, amount).encodeABI(),
        nonce: nonce
    };
    num = await web3.eth.estimateGas(tx);
    tx.gas = num;
    console.log(`Current gas: ${num}`)
    try {
        const receipt = await web3.eth.sendTransaction(tx).once("transactionHash", (txhash) => {
            console.log(`Mining transaction ...`);
            console.log(`https://${network}.etherscan.io/tx/${txhash}`);
        });
        console.log(`Mined in block ${receipt.blockNumber}`);
        return new Promise((resolve) => {
            resolve(receipt.blockNumber);
        })
    } catch (error) {
        console.log(error)
    }
}

async function getNonce(address, privateKey) {
    var web3 = getWeb3Instance(privateKey);
    var nonce = await web3.eth.getTransactionCount(address);
    // console.log(nonce)
    return new Promise((resolve) => {
        resolve(nonce);
    })
}

// transfer gbzz to node
async function transferTokenToNode() {
    var nodeMsgs = await getNodeMsg(tableName);
    var nonce = await getNonce(fromWalletAddress, walletPrivateKey);
    /*
    nodeMsgs.forEach((item) => {
        console.log(`To address: ${item.addr}, nonce: ${nonce}`);
        transferToken(walletPrivateKey, fromWalletAddress, item.addr, nonce, amount);
        ++nonce;
    })
    */
    for (j = 0, len = nodeMsgs.length; j < len; j++) {
        console.log(`To address: ${nodeMsgs[j].addr}, nonce: ${nonce}`);
        transferToken(walletPrivateKey, fromWalletAddress, nodeMsgs[j].addr, nonce, amount);
        ++nonce;
        // sleep可严格确保顺序，否则可能会出现如当前nonce为40，但nonce为42的交易先被提交，导致Error: Transaction was not mined within 750 seconds
        await sleep(3000);
    }
}

// getNonce(fromWalletAddress, walletPrivateKey)
transferTokenToNode()
