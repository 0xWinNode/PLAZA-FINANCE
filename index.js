const Web3 = require('web3');
const axios = require('axios');
const chalk = require('chalk');  // For colorful logging
const fs = require('fs');  // For reading cookies and private keys from file

// Initialize web3 with your RPC URL
const web3 = new Web3('https://sepolia.base.org');

// Address for wstETH token
const wstETHAddress = '0x13e5fb0b6534bb22cbc59fae339dbbe0dc906871';

// Function to ensure unlimited spending for wstETH
async function ensureUnlimitedSpending(privateKey, spenderAddress) {
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  const ownerAddress = account.address;

  // Create contract instance for wstETH
  const wstETHContract = new web3.eth.Contract(erc20Abi, wstETHAddress);

  try {
    // Check the current allowance
    const allowance = await wstETHContract.methods.allowance(ownerAddress, spenderAddress).call();
    const maxUint = web3.utils.toBN('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

    if (web3.utils.toBN(allowance).lt(maxUint)) {
      console.log(chalk.yellow(`Allowance for wstETH not unlimited. Setting to unlimited`));

      // Approve unlimited spending
      const approveMethod = wstETHContract.methods.approve(spenderAddress, maxUint.toString());
      const gasEstimate = await approveMethod.estimateGas({ from: ownerAddress });
      const nonce = await web3.eth.getTransactionCount(ownerAddress);
      const tx = {
        from: ownerAddress,
        to: wstETHAddress,
        gas: gasEstimate,
        nonce: nonce,
        data: approveMethod.encodeABI(),
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      console.log(chalk.green(`Unlimited allowance set for wstETH with tx hash: ${receipt.transactionHash}`));
    } else {
      console.log(chalk.green(`Allowance for wstETH is already unlimited`));
    }
  } catch (error) {
    console.error(chalk.red(`Error setting unlimited allowance for wstETH: ${error.message}`));
  }
}

// Contract ABI for bondToken, lToken, create, and redeem functions
const contractAbi = [{"inputs":[],"name":"bondToken","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lToken","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"enum Pool.TokenType","name":"tokenType","type":"uint8"},{"internalType":"uint256","name":"depositAmount","type":"uint256"},{"internalType":"uint256","name":"minAmount","type":"uint256"}],"name":"create","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"enum Pool.TokenType","name":"tokenType","type":"uint8"},{"internalType":"uint256","name":"depositAmount","type":"uint256"},{"internalType":"uint256","name":"minAmount","type":"uint256"}],"name":"redeem","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}];

// Contract address for the main contract
const contractAddress = '0x47129e886b44B5b8815e6471FCD7b31515d83242';  // Replace with actual contract address

// Initialize contract instance
const contract = new web3.eth.Contract(contractAbi, contractAddress);

// ERC-20 ABI for `allowance`, `approve`, and `balanceOf`
const erc20Abi = [{"constant":true,"inputs":[{"name":"_owner","type":"address"},{"name":"_spender","type":"address"}],"name":"allowance","outputs":[{"name":"remaining","type":"uint256"}],"type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"success","type":"bool"}],"type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}];

// Path to the cookies file
const cookiesFilePath = './cookies.txt';

// Function to read the cookies from a text file
function readCookiesFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data.split('\n').filter(line => line.trim() !== '');  // Split lines and filter empty lines
  } catch (error) {
    console.error(chalk.red(`Error reading cookies from file: ${error.message}`));
    return [];
  }
}

// Function to find the appropriate cookie based on the address
function findCookieForAddress(cookies, address) {
  for (const cookie of cookies) {
    if (cookie.includes(address)) {
      return cookie;  // Return the matching cookie
    }
  }
  return null;  // Return null if no matching cookie is found
}

// Claim Faucet Function using the matched cookie
async function claimFaucet(address, cookie) {
  try {
    // Encode the cookie string to ensure it has no invalid characters
    const encodedCookie = encodeURIComponent(cookie);

    const response = await axios.post('https://testnet.plaza.finance/api/faucet-queue', null, {
      params: { address: address },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/json',
        'Cookie': encodedCookie  // Attach the encoded cookie here
      }
    });

    console.log(chalk.green(`Faucet claim initiated`));
    console.log(chalk.yellow('Claim Response:', response.data));
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.error(chalk.red('You can only use the faucet once per day.'));
    } else if (error.response && error.response.status === 403) {
      console.error(chalk.red('403 Forbidden: You may have hit a rate limit or are blocked.'));
    } else {
      console.error(chalk.red(`Error claiming faucet`));
    }
  }
}

// Helper function to generate random deposit amount between 0.009 and 0.01 ETH
function getRandomDepositAmount() {
  const min = 0.009;
  const max = 0.01;
  const randomEthAmount = Math.random() * (max - min) + min;
  return web3.utils.toWei(randomEthAmount.toString(), 'ether');  // Convert to Wei
}

// Function to get 50% of the token balance
async function getFiftyPercentBalance(tokenType, userAddress) {
  const tokenContractAddress = await getTokenContractAddress(tokenType);
  const tokenContract = new web3.eth.Contract(erc20Abi, tokenContractAddress);
  const balance = await tokenContract.methods.balanceOf(userAddress).call();

  // Convert the balance to a BigNumber and return 50% of it as a whole number
  return web3.utils.toBN(balance).div(web3.utils.toBN(2));  // Return half of the balance in Wei as BigNumber
}

// Function to perform either redeem or create with retry mechanism using seconds as delay
async function performAction(action, tokenType, depositAmount, minAmount, privateKey) {
  const maxRetries = 5;  // Set max number of retries
  const retryDelayInSeconds = 30;  // Delay in seconds between retries

  let attempt = 0;
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  const senderAddress = account.address;

  while (attempt < maxRetries) {
    try {
      let actionMethod;
      let tokenName = tokenType === 0 ? "Bond" : "Leverage";  // Determine token name

      if (action === 'create') {
        actionMethod = contract.methods.create(tokenType, depositAmount, minAmount);
      } else if (action === 'redeem') {
        const redeemAmount = await getFiftyPercentBalance(tokenType, senderAddress);
        if (redeemAmount.eq(web3.utils.toBN(0))) {
          console.log(chalk.red('No balance to redeem.'));
          return; // Exit if there’s nothing to redeem
        }

        actionMethod = contract.methods.redeem(tokenType, redeemAmount, minAmount);
      } else {
        throw new Error('Invalid action. Use "create" or "redeem".');
      }

      const nonce = await web3.eth.getTransactionCount(senderAddress);
      const gasEstimate = await actionMethod.estimateGas({ from: senderAddress });

      const tx = {
        from: senderAddress,
        to: contractAddress,
        gas: gasEstimate,
        nonce: nonce,
        data: actionMethod.encodeABI(),
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);

      // The code to catch revert errors
      try {
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log(chalk.green(`TX success hash: ${receipt.transactionHash}`));
        return;  // Exit function if successful
      } catch (error) {
        console.error(chalk.red('Transaction failed:', error.message));
        if (error.data) {
          console.error(chalk.red('Revert reason:', web3.utils.hexToAscii(error.data)));
        }
      }

    } catch (error) {
      attempt++;
      console.error(chalk.red(`Error performing ${action} on attempt ${attempt} : ${error.message}`));

      if (attempt < maxRetries) {
        console.log(chalk.yellow(`Retrying in ${retryDelayInSeconds} seconds...`));
        await new Promise((resolve) => setTimeout(resolve, retryDelayInSeconds * 1000));  // Wait for retryDelayInSeconds seconds before retrying
      } else {
        console.error(chalk.red(`Max retries reached. Failed to perform ${action}.`));
      }
    }
  }
}

// Read private keys from private_keys.txt
function readPrivateKeys() {
  try {
    const keys = fs.readFileSync('private_keys.txt', 'utf8')
      .split('\n')  // Split by newlines
      .filter(key => key.trim() !== '')  // Filter out empty lines
      .map(key => key.trim());  // Trim any extra spaces or newlines from each key

    // Ensure all private keys are 32 bytes long (64 hex characters)
    keys.forEach((key, index) => {
      if (key.length !== 64) {  // A valid private key should be 64 characters long
        throw new Error(`Private key at line ${index + 1} must be 32 bytes (64 characters) long`);
      }
    });

    return keys;
  } catch (error) {
    console.error(chalk.red('Error reading private_keys.txt:', error.message));
    process.exit(1);
  }
}

// Function to print the header
function printHeader() {
  const line = "=".repeat(50); // Create a line of 50 "=" characters
  const title = "Auto Daily Plaza Finance";
  const createdBy = "Bot created by: https://t.me/airdropwithmeh";

  // Calculate the padding needed to center the title and createdBy
  const totalWidth = 50;

  const titlePadding = Math.floor((totalWidth - title.length) / 2);  // Padding for title
  const createdByPadding = Math.floor((totalWidth - createdBy.length) / 2);  // Padding for createdBy

  // Center the title and createdBy text
  const centeredTitle = title.padStart(titlePadding + title.length).padEnd(totalWidth);
  const centeredCreatedBy = createdBy.padStart(createdByPadding + createdBy.length).padEnd(totalWidth);

  console.log(chalk.cyan.bold(line));  // Print line in cyan and bold
  console.log(chalk.cyan.bold(centeredTitle));  // Print centered title in cyan and bold
  console.log(chalk.green(centeredCreatedBy));  // Print centered creator info in green
  console.log(chalk.cyan.bold(line));  // Print line again in cyan and bold
}

// Helper function to get token contract address (bondToken or lToken)
async function getTokenContractAddress(tokenType) {
  if (tokenType === 0) {
    return await contract.methods.bondToken().call();
  } else if (tokenType === 1) {
    return await contract.methods.lToken().call();
  }
}

// Function to process wallets
async function processWallets() {
  const bondTokenType = 0;  // 0 for Bond ETH
  const leverageTokenType = 1;  // 1 for Leverage ETH
  const minAmount = web3.utils.toWei('0.01', 'ether');  // Example: 0.01 Ether

  printHeader();
  const privateKeys = readPrivateKeys();
  const cookies = readCookiesFromFile(cookiesFilePath);

  for (const privateKey of privateKeys) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const walletAddress = account.address;

    console.log(chalk.yellow(`\n=== CYCLE STARTED FOR WALLET: ${chalk.blue(walletAddress)} ===`));

    // Step 1: Claim the faucet
    const cookie = findCookieForAddress(cookies, walletAddress);
    if (cookie) {
      console.log(chalk.green(`Found cookie for ${walletAddress}. Claiming faucet...`));
      await claimFaucet(walletAddress, cookie);
    } else {
      console.error(chalk.red(`No matching cookie for ${walletAddress}. Skipping faucet claim.`));
    }

    // Continue with other processes even if faucet is skipped

    // Step 2: Ensure unlimited spending for wstETH
    await ensureUnlimitedSpending(privateKey, contractAddress);

    // Step 3: Create Bond Token with random deposit amount
    const randomBondAmount = getRandomDepositAmount();
    console.log(chalk.blue(`Creating Bond Token with amount: ${chalk.yellow(web3.utils.fromWei(randomBondAmount, 'ether'))} BOND`));
    await performAction('create', bondTokenType, randomBondAmount, minAmount, privateKey);

    // Step 4: Create Leverage Token with random deposit amount
    const randomLeverageAmount = getRandomDepositAmount();
    console.log(chalk.blue(`Creating Leverage Token with amount: ${chalk.yellow(web3.utils.fromWei(randomLeverageAmount, 'ether'))} LEV`));
    await performAction('create', leverageTokenType, randomLeverageAmount, minAmount, privateKey);

    // Step 5: Redeem 50% of Bond Token balance
    console.log(chalk.magenta('Redeeming 50% of Bond Token...'));
    await performAction('redeem', bondTokenType, randomBondAmount, minAmount, privateKey);

    // Step 6: Redeem 50% of Leverage Token balance
    console.log(chalk.magenta('Redeeming 50% of Leverage Token...'));
    await performAction('redeem', leverageTokenType, randomLeverageAmount, minAmount, privateKey);

    console.log(chalk.yellow(`=== CYCLE COMPLETE FOR WALLET: ${chalk.blue(walletAddress)} ===\n`));
    console.log(chalk.green(`Waiting for 30 seconds before processing the next wallet...`));
    await new Promise((resolve) => setTimeout(resolve, 30 * 1000));  // Wait for retryDelayInSeconds seconds before retrying
  }

  console.log(chalk.green('=== ALL WALLETS PROCESSED ==='));
}

// Helper function to format the next run time
function getNextRunTime(delayInMs) {
  const nextRunDate = new Date(Date.now() + delayInMs);
  const hours = nextRunDate.getHours().toString().padStart(2, '0');
  const minutes = nextRunDate.getMinutes().toString().padStart(2, '0');
  const seconds = nextRunDate.getSeconds().toString().padStart(2, '0');
  const date = nextRunDate.getDate().toString().padStart(2, '0');
  const month = (nextRunDate.getMonth() + 1).toString().padStart(2, '0'); // Month is zero-based
  const year = nextRunDate.getFullYear();

  return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
}

// Run the script and repeat every 6 hours
setInterval(async () => {
  console.log(chalk.cyan.bold(`Running the process at ${new Date().toLocaleString()}`));
  await processWallets();
  
  // Calculate and print out the next run time (6 hours later)
  const delayInMs = 6 * 60 * 60 * 1000;  // 6 hours in milliseconds
  const nextRunTime = getNextRunTime(delayInMs);
  console.log(chalk.green(`Process complete. Next run will be at ${nextRunTime}`));
}, 6 * 60 * 60 * 1000);  // 6 hours in milliseconds

// Run immediately on start
(async () => {
  console.log(chalk.cyan.bold(`Running the process at ${new Date().toLocaleString()}`));
  await processWallets();

  // Calculate and print out the next run time (6 hours later)
  const delayInMs = 6 * 60 * 60 * 1000;  // 6 hours in milliseconds
  const nextRunTime = getNextRunTime(delayInMs);
  console.log(chalk.green(`Process complete. Next run will be at ${nextRunTime}`));
})();
