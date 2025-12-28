// NeoShops + Economy System for KubeJS 7.x (Minecraft 1.21.1)
// Author: XxTheyLuvShyxX







console.info('╔══════════════════════════════════════════════════════════════════════════╗');
console.info('║   ███╗   ██╗███████╗ ██████╗ ███████╗██╗  ██╗ ██████╗ ██████╗ ███████╗   ║');
console.info('║   ████╗  ██║██╔════╝██╔═══██╗██╔════╝██║  ██║██╔═══██╗██╔══██╗██╔════╝   ║');
console.info('║   ██╔██╗ ██║█████╗  ██║   ██║███████╗███████║██║   ██║██████╔╝███████╗   ║');
console.info('║   ██║╚██╗██║██╔══╝  ██║   ██║╚════██║██╔══██║██║   ██║██╔═══╝ ╚════██║   ║');
console.info('║   ██║ ╚████║███████╗╚██████╔╝███████║██║  ██║╚██████╔╝██║     ███████║   ║');
console.info('║   ╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚══════╝   ║');
console.info('║                          + ECONOMY                                       ║');
console.info('║                   Book-Based Shop System                                 ║');
console.info('║                   Player Economy Enabled                                 ║');
console.info('║                   Shops Tied to Book Authors                             ║');
console.info('║                   Author: XxTheyLuvShyxX                                 ║');
console.info('╚══════════════════════════════════════════════════════════════════════════╝');

const CONFIG = {
  currency: '$',
  startingBalance: 1000,
  adminGroup: 'admin',  // LuckPerms group name for admin permissions
  shopSignMaterial: 'minecraft:oak_sign'  // Sign type for shops
};

const Economy = {
  getData(server) {
    if (!server.persistentData.contains('neoshops_balances')) server.persistentData.put('neoshops_balances', {});
    return server.persistentData.get('neoshops_balances');
  },
  getBalance(server, uuid) {
    const data = this.getData(server);
    let v = data[uuid];
    if (v == null || isNaN(Number(v))) {
      v = CONFIG.startingBalance;
      data[uuid] = v;
      server.persistentData.put('neoshops_balances', data);
    }
    return Number(v);
  },
  setBalance(server, uuid, amount) {
    const data = this.getData(server);
    data[uuid] = Number(amount) || 0;
    server.persistentData.put('neoshops_balances', data);
  },
  addBalance(server, uuid, delta) {
    const cur = this.getBalance(server, uuid);
    this.setBalance(server, uuid, cur + Number(delta));
  }
};

// Utility functions
const NeoShopsUtils = {
  shortenItemName(itemId) {
    // Remove mod prefix and replace _ with space
    let name = itemId.split(':')[1] || itemId;
    return name.replace(/_/g, ' ');
  },
  parseBookConfig(book) {
    // Parse separate pages: page 0 for buy/sell, page 1 for item, page 2 for price
    const pages = book.pages;
    if (!pages || pages.length < 3) return null;
    const page0 = (pages[0].text || pages[0]).toLowerCase();
    const page1 = (pages[1].text || pages[1]).toLowerCase();
    const page2 = (pages[2].text || pages[2]).toLowerCase();
    const isBuy = page0.includes('buy');
    const isSell = page0.includes('sell');
    if (!isBuy && !isSell) return null;
    // Extract item tag from page 1
    const itemMatch = page1.match(/([a-z0-9_]+:[a-z0-9_]+)/);
    if (!itemMatch) return null;
    const item = itemMatch[1];
    // Extract price from page 2
    const priceMatch = page2.match(/(\d+)/);
    if (!priceMatch) return null;
    const price = parseInt(priceMatch[1]);
    return {
      type: isBuy ? 'buy' : 'sell',
      item: item,
      price: price,
      owner: book.author || ''
    };
  },
  hasPermission(player, server) {
    // Check OP or LuckPerms admin group
    if (player.isOp()) return true;
    try {
      const perms = player.getPermissions();
      return perms && perms.groups && perms.groups.includes(CONFIG.adminGroup);
    } catch(e) {
      return false;
    }
  }
};

const Shops = {
  getData(server) {
    if (!server.persistentData.contains('neoshops_shops')) server.persistentData.put('neoshops_shops', {});
    return server.persistentData.get('neoshops_shops');
  },
  createShop(server, pos, ownerUuid, config, isAdmin) {
    const data = this.getData(server);
    const key = `${pos.x}_${pos.y}_${pos.z}`;
    data[key] = {
      owner: ownerUuid,
      type: config.type,
      item: config.item,
      price: config.price,
      isAdmin: isAdmin
    };
    server.persistentData.put('neoshops_shops', data);
    console.info('[NeoShops] Shop created at ' + key + ' by ' + ownerUuid);
  },
  getShop(server, pos) {
    const data = this.getData(server);
    const key = `${pos.x}_${pos.y}_${pos.z}`;
    return data[key] || null;
  },
  deleteShop(server, pos) {
    const data = this.getData(server);
    const key = `${pos.x}_${pos.y}_${pos.z}`;
    if (data[key]) {
      delete data[key];
      server.persistentData.put('neoshops_shops', data);
      console.info('[NeoShops] Shop deleted at ' + key);
    }
  },
  getAllShops(server) {
    return this.getData(server);
  },
  getContainerBehindSign(pos, level) {
    const signBlock = level.getBlock(pos);
    if (!signBlock.id.includes('sign')) return null;
    const facing = signBlock.getFacing();
    const behindPos = pos.offset(facing.getOpposite());
    const behindBlock = level.getBlock(behindPos);
    if (behindBlock.id.includes('chest') || behindBlock.id.includes('barrel')) {
      return behindBlock.getEntity();
    }
    return null;
  },
  getStockFromContainer(container, itemId) {
    if (!container) return 0;
    return container.inventory.count(itemId);
  },
  updateSignText(server, pos, shop) {
    // Update sign text based on shop data
    const level = server.getLevel(pos.dimension || 'minecraft:overworld');
    const block = level.getBlock(pos);
    if (block.id.includes('sign')) {
      const shortName = NeoShopsUtils.shortenItemName(shop.item);
      const color = shop.type === 'buy' ? '§a' : '§c';
      const typeText = shop.type === 'buy' ? 'Buy' : 'Sell';
      let stockText = '∞';
      if (!shop.isAdmin) {
        const container = this.getContainerBehindSign(pos, level);
        stockText = this.getStockFromContainer(container, shop.item).toString();
      }
      // Split name if too long
      const line2 = shortName.length > 15 ? shortName.substring(0, 15) : shortName;
      const line3 = shortName.length > 15 ? shortName.substring(15) : '';
      block.setText(0, color + typeText);
      block.setText(1, line2);
      block.setText(2, line3);
      block.setText(3, shop.price + CONFIG.currency + ' (' + stockText + ')');
    }
  }
};

console.info('[NeoShops] Minimal scaffold loaded');

ServerEvents.commandRegistry(function(event) {
  const Commands = event.commands;
  const Arguments = event.arguments;

  console.info('[NeoShops] ===== COMMAND REGISTRY START =====');
  console.info('[NeoShops] Commands type: ' + (typeof Commands));
  console.info('[NeoShops] Arguments type: ' + (typeof Arguments));



  // /bal - show balance
  try {
    console.info('[NeoShops] Registering bal...');
    event.register(
      Commands.literal('bal')
        .executes(function(ctx) {
          const player = ctx.source.player;
          const server = ctx.source.server;
          if (!player) return 0;
          const bal = Economy.getBalance(server, player.uuid.toString());
          player.tell('§eBalance: ' + CONFIG.currency + bal);
          console.info('[NeoShops] bal executed for ' + player.username);
          return 1;
        })
    );
    console.info('[NeoShops] ✓ bal registered');
  } catch(e) {
    console.error('[NeoShops] ✗ bal FAILED: ' + e);
  }

  // /pay <player> <amount> - pay another player
  try {
    console.info('[NeoShops] Registering pay...');
    event.register(
      Commands.literal('pay')
        .then(Commands.argument('target', Arguments.PLAYER.create(event))
          .then(Commands.argument('amount', Arguments.INTEGER.create(event))
            .executes(function(ctx) {
              const player = ctx.source.player;
              const server = ctx.source.server;
              if (!player) return 0;

              const target = Arguments.PLAYER.getResult(ctx, 'target');
              const amount = Arguments.INTEGER.getResult(ctx, 'amount');

              console.info('[NeoShops] /pay invoked by ' + player.username + ' target=' + target.username + ' amount=' + amount);

              const amtNum = Number(amount);
              if (isNaN(amtNum) || amtNum <= 0) {
                player.tell('§cInvalid amount: must be a positive number');
                return 0;
              }

              if (target.uuid.toString() === player.uuid.toString()) {
                player.tell('§cYou cannot pay yourself');
                return 0;
              }

              const senderBal = Economy.getBalance(server, player.uuid.toString());
              if (senderBal < amtNum) {
                player.tell('§cInsufficient funds. Your balance: ' + CONFIG.currency + senderBal);
                return 0;
              }

              Economy.addBalance(server, player.uuid.toString(), -amtNum);
              Economy.addBalance(server, target.uuid.toString(), amtNum);

              player.tell('§aSent ' + CONFIG.currency + amtNum + ' to ' + target.username);
              target.tell('§aReceived ' + CONFIG.currency + amtNum + ' from ' + player.username);

              console.info('[NeoShops] /pay: ' + player.username + ' -> ' + target.username + ' : ' + amtNum);
              return 1;
            })
          )
        )
    );
    console.info('[NeoShops] ✓ pay registered');
  } catch(e) {
    console.error('[NeoShops] ✗ pay FAILED: ' + e);
  }

// /playershop create - create player shop
  try {
    console.info('[NeoShops] Registering playershop create...');
    event.register(
      Commands.literal('playershop')
        .then(Commands.literal('create')
          .executes(function(ctx) {
            const player = ctx.source.player;
            const server = ctx.source.server;
            if (!player) return 0;

            const hitResult = player.rayTrace(5);
            // Check if looking at a block
            if (!hitResult || !hitResult.block) {
              player.tell('§cYou must look at a container to create a shop');
              return 0;
            }

            const block = hitResult.block;
            const container = block.entity;

            // Robust inventory check for ATM10 modded containers
            if (!container || !container.inventory) {
              player.tell('§cThis block does not have a compatible inventory.');
              return 0;
            }

            // Find signed book
            let bookItem = null;
            // KubeJS 7 uses .inventory.slotCount or .inventory.containerSize
            const inv = container.inventory;
            const invSize = inv.slotCount || inv.containerSize || 0;

            for (let i = 0; i < invSize; i++) {
              const item = inv.getStackInSlot(i);
              if (item.id === 'minecraft:written_book') {
                bookItem = item;
                break;
              }
            }

            if (!bookItem) {
              player.tell('§cNo signed book found! Put one inside the ' + block.id.split(':')[1]);
              return 0;
            }

            const config = NeoShopsUtils.parseBookConfig(bookItem);
            if (!config) {
              player.tell('§cInvalid book format! Page 1: Buy/Sell, Page 2: Item ID, Page 3: Price');
              return 0;
            }

            player.tell('§aSetup validated! Place a sign on the ' + block.id.split(':')[1] + ' to finish.');
            return 1;
          })
        )
    );
  } catch(e) { console.error('[NeoShops] playershop registry FAILED: ' + e); }

  // /adminshop create - create admin shop
  try {
    console.info('[NeoShops] Registering adminshop create...');
    event.register(
      Commands.literal('adminshop')
        .then(Commands.literal('create')
          .executes(function(ctx) {
            const player = ctx.source.player;
            const server = ctx.source.server;
            if (!player) return 0;

            if (!NeoShopsUtils.hasPermission(player, server)) {
              player.tell('§cYou do not have permission for admin shops.');
              return 0;
            }

            const hitResult = player.rayTrace(5);
            if (!hitResult || !hitResult.block) {
              player.tell('§cLook at a container first.');
              return 0;
            }

            const block = hitResult.block;
            const container = block.entity;

            if (!container || !container.inventory) {
              player.tell('§cInvalid container for admin shop.');
              return 0;
            }

            let bookItem = null;
            const inv = container.inventory;
            const invSize = inv.slotCount || inv.containerSize || 0;

            for (let i = 0; i < invSize; i++) {
              const item = inv.getStackInSlot(i);
              if (item.id === 'minecraft:written_book') {
                bookItem = item;
                break;
              }
            }

            if (!bookItem) {
              player.tell('§cPlace a signed book config inside the container.');
              return 0;
            }

            const config = NeoShopsUtils.parseBookConfig(bookItem);
            if (!config) {
              player.tell('§cCheck your book formatting.');
              return 0;
            }

            // Create admin shop at the container's position
            Shops.createShop(server, block.pos, config.owner, config, true);
            player.tell('§aAdmin shop created! Now place a sign on it.');
            return 1;
          })
        )
    );
  } catch(e) { console.error('[NeoShops] adminshop registry FAILED: ' + e); }

  // /shops info - list all shops
  try {
    console.info('[NeoShops] Registering shops info...');
    event.register(
      Commands.literal('shops')
        .then(Commands.literal('info')
          .executes(function(ctx) {
            const player = ctx.source.player;
            const server = ctx.source.server;
            if (!player) return 0;

            if (!NeoShopsUtils.hasPermission(player, server)) {
              player.tell('§cYou do not have permission to view shop info');
              return 0;
            }

            const allShops = Shops.getAllShops(server);
            const shopList = Object.keys(allShops).map(key => {
              const shop = allShops[key];
              const pos = key.split('_').map(Number);
              let stock = '∞';
              if (!shop.isAdmin) {
                const level = server.getLevel('minecraft:overworld'); // Assume overworld for simplicity
                const container = Shops.getContainerBehindSign({x: pos[0], y: pos[1], z: pos[2]}, level);
                stock = Shops.getStockFromContainer(container, shop.item).toString();
              }
              return `§e[${pos[0]},${pos[1]},${pos[2]}] ${shop.type} ${NeoShopsUtils.shortenItemName(shop.item)} @ ${shop.price}${CONFIG.currency} (stock: ${stock})`;
            });

            if (shopList.length === 0) {
              player.tell('§eNo shops found');
            } else {
              player.tell('§aShops:');
              shopList.forEach(line => player.tell(line));
            }
            console.info('[NeoShops] Shops info requested by ' + player.username);
            return 1;
          })
        )
    );
    console.info('[NeoShops] ✓ shops info registered');
  } catch(e) {
    console.error('[NeoShops] ✗ shops info FAILED: ' + e);
  }

  console.info('[NeoShops] ===== COMMAND REGISTRY COMPLETE =====');
});

BlockEvents.placed(function(event) {
  // Check if a sign is placed for shop creation
  if (event.block.id.includes('sign') && event.player) {
    const player = event.player;
    const server = event.server;
    const pos = event.block.pos;
    const level = server.getLevel(pos.dimension || 'minecraft:overworld');

    // First, check if there's an existing shop behind the sign (for admin shops)
    const behindPos = Shops.getContainerBehindSign(pos, level);
    if (behindPos) {
      const shop = Shops.getShop(server, behindPos.pos);
      if (shop) {
        // Update sign text for existing shop
        Shops.updateSignText(server, pos, shop);
        player.tell('§aShop activated! Right-click the sign to buy/sell');
        console.info('[NeoShops] Shop activated via sign placement by ' + player.username);
        return;
      }
    }

    // Otherwise, check for player shop creation
    const mainHand = player.getMainHandItem();
    if (!mainHand || mainHand.id !== 'minecraft:writable_book') return;

    const config = NeoShopsUtils.parseBookConfig(mainHand);
    if (!config) return;

    // Check if there's a chest/barrel behind the sign for player shops
    const container = Shops.getContainerBehindSign(pos, level);
    if (!container) {
      player.tell('§cYou must place a chest or barrel behind the sign for player shops');
      return;
    }

    // Create player shop
    Shops.createShop(server, pos, player.uuid.toString(), config, false);
    Shops.updateSignText(server, pos, Shops.getShop(server, pos));
    player.tell('§aShop created! Right-click the sign to buy/sell');
    console.info('[NeoShops] Shop created via sign placement by ' + player.username);
  }
});

BlockEvents.rightClicked(function(event) {
  // Handle shop interactions
  if (event.block.id.includes('sign') && event.player) {
    const player = event.player;
    const server = event.server;
    const pos = event.block.pos;
    const shop = Shops.getShop(server, pos);

    if (!shop) return;

    const level = server.getLevel(pos.dimension || 'minecraft:overworld');
    const container = Shops.getContainerBehindSign(pos, level);
    const stock = shop.isAdmin ? 999999 : Shops.getStockFromContainer(container, shop.item);

    if (shop.type === 'buy') {
      // Player is buying from shop
      if (stock <= 0) {
        player.tell('§cOut of stock!');
        return;
      }

      const playerBal = Economy.getBalance(server, player.uuid.toString());
      if (playerBal < shop.price) {
        player.tell('§cInsufficient funds! You need ' + CONFIG.currency + shop.price);
        return;
      }

      // Deduct money and give item
      Economy.addBalance(server, player.uuid.toString(), -shop.price);
      if (!shop.isAdmin) {
        container.inventory.extract(shop.item, 1, false);
      }
      player.give(shop.item, 1);
      Shops.updateSignText(server, pos, shop);

      player.tell('§aBought 1 ' + NeoShopsUtils.shortenItemName(shop.item) + ' for ' + CONFIG.currency + shop.price);
      console.info('[NeoShops] ' + player.username + ' bought from shop at ' + pos.x + ',' + pos.y + ',' + pos.z);

    } else if (shop.type === 'sell') {
      // Player is selling to shop
      const hasItem = player.inventory.count(shop.item) > 0;
      if (!hasItem) {
        player.tell('§cYou don\'t have any ' + NeoShopsUtils.shortenItemName(shop.item) + ' to sell!');
        return;
      }

      // Take item and give money
      player.inventory.extract(shop.item, 1, false);
      Economy.addBalance(server, player.uuid.toString(), shop.price);
      if (!shop.isAdmin) {
        container.inventory.insert(shop.item, 1, false);
      }
      Shops.updateSignText(server, pos, shop);

      player.tell('§aSold 1 ' + NeoShopsUtils.shortenItemName(shop.item) + ' for ' + CONFIG.currency + shop.price);
      console.info('[NeoShops] ' + player.username + ' sold to shop at ' + pos.x + ',' + pos.y + ',' + pos.z);
    }
  }
});

BlockEvents.broken(function(event) {
  const player = event.player;
  const server = event.server;
  const pos = event.block.pos;
  const level = server.getLevel(pos.dimension || 'minecraft:overworld');

  // Check if breaking a sign with a shop
  if (event.block.id.includes('sign') && player) {
    const shop = Shops.getShop(server, pos);

    if (shop) {
      // Check permissions: owner can break their shop, admins can break any
      const isOwner = shop.owner === player.uuid.toString();
      const hasPermission = NeoShopsUtils.hasPermission(player, server);

      if (isOwner || hasPermission) {
        Shops.deleteShop(server, pos);
        player.tell('§aShop deleted');
        console.info('[NeoShops] Shop deleted by ' + player.username + ' at ' + pos.x + ',' + pos.y + ',' + pos.z);
      } else {
        event.cancel();  // Prevent breaking
        player.tell('§cYou cannot break this shop sign');
      }
    }
  }

  // Check if breaking a container that has a shop sign attached
  if ((event.block.id.includes('chest') || event.block.id.includes('barrel')) && player) {
    // Check all 6 directions for signs
    const directions = [
      pos.offset(1, 0, 0), pos.offset(-1, 0, 0),
      pos.offset(0, 1, 0), pos.offset(0, -1, 0),
      pos.offset(0, 0, 1), pos.offset(0, 0, -1)
    ];

    for (const signPos of directions) {
      const signBlock = level.getBlock(signPos);
      if (signBlock.id.includes('sign')) {
        const shop = Shops.getShop(server, signPos);
        if (shop) {
          // Check permissions: owner can break their shop container, admins can break any
          const isOwner = shop.owner === player.uuid.toString();
          const hasPermission = NeoShopsUtils.hasPermission(player, server);

          if (isOwner || hasPermission) {
            Shops.deleteShop(server, signPos);
            player.tell('§aShop deleted');
            console.info('[NeoShops] Shop deleted by breaking container at ' + player.username + ' at ' + pos.x + ',' + pos.y + ',' + pos.z);
          } else {
            event.cancel();  // Prevent breaking
            player.tell('§cYou cannot break this shop container');
          }
          break; // Found a shop sign, no need to check other directions
        }
      }
    }
  }
});

console.info('[NeoShops] Script fully loaded and ready!');
