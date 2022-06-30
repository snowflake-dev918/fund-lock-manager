import { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function ({ deployments: { deploy, execute }, ethers: { getSigners }, network }) {
  const deployer = (await getSigners())[0];

  const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // Mainnet DAI address

  await execute(
    'FundLockManager',
    {from: deployer.address, log: true},
    'registerToken',
    DAI
  )
};
fn.skip = async (hre) => {
    return false
  // Skip this on ropsten or hardhat.
  const chain = parseInt(await hre.getChainId());
  return chain !== 31337 && chain !== 42;
};
fn.tags = ['FundLockManager'];

export default fn;
