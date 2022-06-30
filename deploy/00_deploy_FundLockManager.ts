import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function ({ deployments: { deploy }, ethers: { getSigners }, network }) {
  const deployer = (await getSigners())[0];

  const denominationTokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Mainnet USDC address

  const contractDeployed = await deploy('FundLockManager', {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      denominationTokenAddress
    ]
  });
  console.log('npx hardhat verify --network '+ network.name +  ' ' + contractDeployed.address);

};
fn.skip = async (hre) => {
  return false;
  // Skip this on ropsten or hardhat.
  const chain = parseInt(await hre.getChainId());
  return (chain !== 31337) && (chain !== 42);
};
fn.tags = ['FundLockManager'];

export default fn;
