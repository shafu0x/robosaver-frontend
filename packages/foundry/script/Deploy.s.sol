//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {RoboSaverVirtualModule} from "../contracts/YourContract.sol";
import "./DeployHelpers.s.sol";

import {Bouncer} from "@gnosispay-kit/Bouncer.sol";
import {Delay} from "@delay-module/Delay.sol";
import {Roles} from "@roles-module/Roles.sol";

import {RoboSaverVirtualModule} from "../contracts/YourContract.sol";

contract DeployScript is ScaffoldETHDeploy {
    error InvalidPrivateKey(string);

    // safe target
    address constant GNOSIS_SAFE = 0xa4A4a4879dCD3289312884e9eC74Ed37f9a92a55;

    // gelato agent
    address constant TRADER_AGENT = 0x416c4E9accc71D0e973d7c16Cf67A48981d9d18b;

    // eure config: min for testing purposes
    uint128 constant MIN_EURE_ALLOWANCE = 10e18;

    // delay config
    uint256 constant COOL_DOWN_PERIOD = 180; // 3 minutes
    uint256 constant EXPIRATION_PERIOD = 1800; // 30 minutes

    // roles config
    uint64 constant ALLOWANCE_PERIOD = 1 days;

    // bouncer config
    bytes4 constant SET_ALLOWANCE_SELECTOR =
        bytes4(keccak256(bytes("setAllowance(bytes32,uint128,uint128,uint128,uint64,uint64)"))); // 0xa8ec43ee
    bytes32 constant SET_ALLOWANCE_KEY = keccak256("SPENDING_ALLOWANCE");

    // gnosis pay modules
    Delay delayModule;
    Roles rolesModule;

    Bouncer bouncerContract;

    // robosaver module
    RoboSaverVirtualModule roboModule;

    function run() public {
        // grab pk from `.env`
        // uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        // address deployer = vm.addr(deployerPrivateKey);
        // vm.startBroadcast(deployerPrivateKey);
        vm.startBroadcast();

        // 1. {RolesModule}
        // rolesModule = new Roles(deployer, GNOSIS_SAFE, GNOSIS_SAFE);
        rolesModule = new Roles(msg.sender, GNOSIS_SAFE, GNOSIS_SAFE);

        // // 2. {DelayModule}
        // delayModule = new Delay(GNOSIS_SAFE, GNOSIS_SAFE, GNOSIS_SAFE, COOL_DOWN_PERIOD, EXPIRATION_PERIOD);

        // // 3. {Bouncer}
        // bouncerContract = new Bouncer(GNOSIS_SAFE, address(rolesModule), SET_ALLOWANCE_SELECTOR);

        // // 4. {RoboSaverVirtualModule}
        // roboModule = new RoboSaverVirtualModule(address(delayModule), address(rolesModule), TRADER_AGENT, 50e18);

        // // 5. {Allowance config}
        // rolesModule.setAllowance(
        //     SET_ALLOWANCE_KEY,
        //     MIN_EURE_ALLOWANCE,
        //     MIN_EURE_ALLOWANCE,
        //     MIN_EURE_ALLOWANCE,
        //     ALLOWANCE_PERIOD,
        //     uint64(block.timestamp)
        // );

        // @note after deployment it is require to:
        // 1. Enable delay & roles modules on the safe (to be exec from the safe)
        // 2. Enable RoboSaverVirtualModule on the delay module (to be exec from the safe)
    }

    function test() public {}
}
