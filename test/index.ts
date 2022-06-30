import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers, getNamedAccounts, network,  } from "hardhat";
import ERC20ABI from '../data/ERC20';
import IUniswapV2Router from '../data/IUniswapV2Router';

let _signer: SignerWithAddress;
let _fundOwner: SignerWithAddress;
let _unlocker: SignerWithAddress;
let _other: SignerWithAddress;

let fundLockManager: Contract;
let denominationERC20: Contract;
let DAIContract: Contract;
let uniswapV2Router: Contract;
let wethContract: Contract;

const denominationTokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Mainnet usdc address
const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; //mainnet DAI address;
const uniswapV2RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Mainnet Uniswap V2 Router
const lockTime = 365 * 24 * 3600; // 1 year lock
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("FundLockManager", function () {
  beforeEach(async () => {
    const contractFactory = await ethers.getContractFactory("FundLockManager"); 
    fundLockManager = await contractFactory.deploy(denominationTokenAddress);
    await fundLockManager.deployed();

    
    denominationERC20 = new ethers.Contract(denominationTokenAddress, ERC20ABI, ethers.provider);
    DAIContract = new ethers.Contract(DAI_ADDRESS, ERC20ABI, ethers.provider);
    uniswapV2Router = new ethers.Contract(uniswapV2RouterAddress, IUniswapV2Router, ethers.provider);
    wethContract = new ethers.Contract(WETH_ADDRESS, ERC20ABI, ethers.provider)
    
    const {deployer, fundOwner, unlocker, other} = await getNamedAccounts();
    _signer = await ethers.getSigner(deployer);
    _fundOwner = await ethers.getSigner(fundOwner);
    _unlocker = await ethers.getSigner(unlocker);
    _other = await ethers.getSigner(other);
    
    await fundLockManager.connect(_signer).registerToken(DAI_ADDRESS);
    
    //fund usdc and DAI to the fundOwner
    let path = [WETH_ADDRESS, DAI_ADDRESS];

    // fund DAI - swap 100 eth with DAI
    await wethContract.connect(_fundOwner).approve(uniswapV2Router.address, ethers.utils.parseEther("100"));

    let tx = await uniswapV2Router.connect(_fundOwner).swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      path,
      fundOwner,
      (await ethers.provider.getBlock("latest")).timestamp + 1000,
      {
        value: ethers.utils.parseEther("1"),
        gasLimit: 30000000,
        gasPrice: ethers.utils.parseUnits('100', 'gwei')
      }
     );
    // fund usdc - swap 100 eth with usdc
    path = [WETH_ADDRESS, denominationTokenAddress];
    await wethContract.connect(_fundOwner).approve(uniswapV2Router.address, ethers.utils.parseEther("100"));

    tx = await uniswapV2Router.connect(_fundOwner).swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      path,
      fundOwner,
      (await ethers.provider.getBlock("latest")).timestamp + 1000,
      {
        value: ethers.utils.parseEther("1"),
        gasLimit: 30000000,
        gasPrice: ethers.utils.parseUnits('100', 'gwei')
      }
    );
  })

  it("Check deploy: ", async function () {
    expect(await fundLockManager.owner()).to.equal(_signer.address);
  });

  it("Check eth => usdc swap function on uniswap: ", async () => {
    expect(await denominationERC20.balanceOf(fundLockManager.address)).to.be.equal(0);
    
    //Send eth to fundLockManager, swap
    await fundLockManager.connect(_fundOwner).LockEth(_unlocker.address, lockTime, true, {
      value: ethers.utils.parseEther("1")
    } );

    // check if eth was swapped with usdc
    expect(await denominationERC20.balanceOf(fundLockManager.address)).to.above(0);

    // check if fundLockManager's eth balance is 0 after swap
    expect(await ethers.provider.getBalance(fundLockManager.address)).to.be.equal(0);
  });

  it("Check anytoken => usdc and anytoken => eth swap function on uniswap: ", async () => {

    expect(await denominationERC20.balanceOf(fundLockManager.address)).to.be.equal(0);

    //approve 1000 DAI
    await DAIContract.connect(_fundOwner).approve(fundLockManager.address, ethers.utils.parseEther("1000"));

    //Send 100 DAI to fundLockManager, swap dai => usdc
    await fundLockManager.connect(_fundOwner).LockToken(DAI_ADDRESS ,ethers.utils.parseEther("100"), _unlocker.address, lockTime,true);
    // check if DAI was swapped with usdc
    expect(await denominationERC20.balanceOf(fundLockManager.address)).to.above(0);

    //Send 100 DAI to fundLockManager, swap dai => eth
    await fundLockManager.connect(_fundOwner).LockToken(DAI_ADDRESS ,ethers.utils.parseEther("100"), _unlocker.address, lockTime, false);
    // check contract's eth balance
    expect(await ethers.provider.getBalance(fundLockManager.address)).to.above(0);

    // check if fundLockManager's DAI balance is 0 after swap
    expect(await DAIContract.balanceOf(fundLockManager.address)).to.equal(0);
  });


  it("Check Lock eth with usdc or eth function: ", async () => {
    //check current fundOwner's plan
    expect((await fundLockManager.getPlansByOwner(_fundOwner.address)).length).to.be.equal(0);
    
    //Send eth to fundLockManager, swap
    await fundLockManager.connect(_fundOwner).LockEth(_unlocker.address, lockTime, true, {
      value: ethers.utils.parseEther("1")
    });

    //Send eth to fundLockManager, not swap
    await fundLockManager.connect(_fundOwner).LockEth(_unlocker.address, lockTime, false, {
      value: ethers.utils.parseEther("1")
    });

    //check fundOwner's plan after creating new plan, should be increased 2.
    expect((await fundLockManager.getPlansByOwner(_fundOwner.address)).length).to.be.equal(2);
    expect(await fundLockManager.getTotalPlanCount()).to.be.equal(2);
  });

  it("Check Lock any erc20 token with usdc or eth function: ", async () => {
    //check current fundOwner's plan
    expect((await fundLockManager.getPlansByOwner(_fundOwner.address)).length).to.be.equal(0);
    
    //approve 1000 DAI
    await DAIContract.connect(_fundOwner).approve(fundLockManager.address, ethers.utils.parseEther("1000"));

    //Send DAI to fundLockManager, swap, create erc20 plan
    await fundLockManager.connect(_fundOwner).LockToken(DAI_ADDRESS, ethers.utils.parseEther("100"), _unlocker.address, lockTime, true);
    //Send DAI to fundLockManager, swap, create eth plan
    await fundLockManager.connect(_fundOwner).LockToken(DAI_ADDRESS, ethers.utils.parseEther("100"), _unlocker.address, lockTime, false);
    
    //check fundOwner's plan after creating new plan, should be increased 2.
    expect((await fundLockManager.getPlansByOwner(_fundOwner.address)).length).to.be.equal(2);
    expect(await fundLockManager.getTotalPlanCount()).to.be.equal(2);
  });

  it("Check unlock funds: ", async () => {
    // create new eth lock
    await fundLockManager.connect(_fundOwner).LockEth(_unlocker.address, lockTime, false, {
      value: ethers.utils.parseEther("1")
    });
    // create new eth lock (usdc)
    await fundLockManager.connect(_fundOwner).LockEth(_other.address, lockTime, true, {
      value: ethers.utils.parseEther("1")
    });
    // create new token lock
    await DAIContract.connect(_fundOwner).approve(fundLockManager.address, ethers.utils.parseEther("1000"));
    await fundLockManager.connect(_fundOwner).LockToken(DAI_ADDRESS, ethers.utils.parseEther("100"), _unlocker.address, lockTime, true);

    await DAIContract.connect(_fundOwner).approve(fundLockManager.address, ethers.utils.parseEther("1000"));
    await fundLockManager.connect(_fundOwner).LockToken(DAI_ADDRESS, ethers.utils.parseEther("100"), _unlocker.address, lockTime, true);


    let lockFunds = await fundLockManager.connect(_fundOwner).getPlansByOwner(_fundOwner.address);
    //others will fail for claim.
    await expect(fundLockManager.connect(_other).claimLockedFund(lockFunds[0].id)).revertedWith("You are not unlocker.");
    //only unlokcer can claim

    //spent time
    await network.provider.send("evm_increaseTime", [3600]);
    await network.provider.send("hardhat_mine", ["0x1"]);

    let ethBalance = await ethers.provider.getBalance(_unlocker.address);
    await fundLockManager.connect(_unlocker).claimLockedFund(lockFunds[0].id);
    expect( (await ethers.provider.getBalance(_unlocker.address)).sub(ethBalance)).to.above(ethers.utils.parseEther("0.99"));
    //revert already claimed
    await expect(fundLockManager.connect(_unlocker).claimLockedFund(lockFunds[0].id)).revertedWith("Fund already claimed.");

    expect(await denominationERC20.balanceOf(_other.address)).to.be.equal(0);
    await fundLockManager.connect(_other).claimLockedFund(lockFunds[1].id);
    expect(await denominationERC20.balanceOf(_other.address)).to.above(0);

    expect(await denominationERC20.balanceOf(_unlocker.address)).to.be.equal(0);
    await fundLockManager.connect(_unlocker).claimLockedFund(lockFunds[2].id);
    expect(await denominationERC20.balanceOf(_unlocker.address)).to.above(0);

    //spent time, cannot claim expired 
    await network.provider.send("evm_increaseTime", [lockTime + 3600]);
    await network.provider.send("hardhat_mine", ["0x1"]);
    await expect(fundLockManager.connect(_unlocker).claimLockedFund(lockFunds[3].id)).to.revertedWith("Fund expired.");
  });

  it("Check unlockable funds and claimable funds function: ", async () => {
    // create new eth lock
    await fundLockManager.connect(_fundOwner).LockEth(_unlocker.address, lockTime, false, {
      value: ethers.utils.parseEther("1")
    });
    // create new eth lock (usdc)
    await fundLockManager.connect(_fundOwner).LockEth(_other.address, lockTime, true, {
      value: ethers.utils.parseEther("1")
    });

    // create new eth lock (usdc)
    await fundLockManager.connect(_other).LockEth(_unlocker.address, lockTime, true, {
      value: ethers.utils.parseEther("1")
    });
    
    expect(await fundLockManager.connect(_fundOwner).getTotalPlanCount()).to.be.equal(3);

    //Owned funds
    let myFunds = await fundLockManager.connect(_fundOwner).getPlansByOwner(_fundOwner.address);
    let length = 0;
    myFunds.map((fund:any) => {
      if (fund && fund.owner != ZERO_ADDRESS) {
        length ++;
      }
    })
    expect(length).to.be.equal(2);

    //Claimable Funds for unlocker
    length = 0;
    myFunds = await fundLockManager.connect(_unlocker).getPlansByUnlocker(_unlocker.address);
    myFunds.map((fund:any) => {
      if (fund && fund.owner !== ZERO_ADDRESS) {
        length ++;
      }
    })
    expect(length).to.be.equal(2);

    //Unclaimed Funds
    length = 0;
    myFunds = await fundLockManager.connect(_fundOwner).getUnClaimedFunds();
    myFunds.map((fund:any) => {
      if (fund && fund.owner !== ZERO_ADDRESS) {
        length ++;
      }
    })
    expect(length).to.be.equal(0);

    await network.provider.send("evm_increaseTime", [lockTime + 3600]);
    await network.provider.send("hardhat_mine", ["0x1"]);
    length = 0;
    myFunds = await fundLockManager.connect(_fundOwner).getUnClaimedFunds();
    myFunds.map((fund:any) => {
      if (fund && fund.owner !== ZERO_ADDRESS) {
        length ++;
      }
    })
    expect(length).to.be.equal(2);
  })
});
