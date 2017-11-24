# api admin responses

These are not documented in the client API as they are only needed if you are writing your own console. It's not an exhaustive list of all the admin functions.

ADMINKEY is required for all of these, and is sent over from the client. The authid is needed too - this is the firebase uid of the user who owns the profile.

## profile
This gets a profile where authid is the firebase auth ID. It will also create a profile if it doesnt exist along with the first account. planID parameter can be supplied to see a new profile with a planid, otherwise it uses the default one. It will return an ok:true whether or not it actually created a profile, but a newProfile:true will be set  in the responseif the profile was created.
```
api.put ("/v2/admin/profile?admin=ADMINKEY&authid=uuu")
```
this the same, but readonly - so it's not able to  create anything
```
api.get ("/v2/admin/profile?admin=ADMINKEY&authid=uuu")
```

```
{
	"ok": true,
	"code": 200,
	"value": {
		"modified": 1511514896309,
		"accounts": {
			"3tj": {
				"active": true,
				"expires": 0,
				"modified": 1511515905647,
				"created": 1511515905647,
				"planId": "x"
			},
			"3ti": {
				"created": 1511515549667,
				"planId": "x",
				"active": true,
				"expires": 0,
				"modified": 1511515549667
			},
			"3th": {
				"active": true,
				"expires": 0,
				"modified": 1511514896309,
				"created": 1511514896309,
				"planId": "x"
			}
		},
		"created": 1511514896309,
		"planId": "x",
		"expires": 0,
		"active": true
	},
	"newProfile": false,
	"operation": "admin/profileGet"
}
```
## addaccount
This gets a profile where authid is the firebase auth ID. Addaccount will create a new account id for a given user. It returns a very similar format to profile, except that the accountId is populate with the account just created. The details of the newly created account can be obtained by picking up this from the response. A planid parameter can be specified, otherwise the planid for the new account comes from the profile.
```
value.accounts[accountId];
```
```
api.put ("/v2/admin/account?admin=ADMINKEY&authid=uuu")
```

```
{
	"ok": true,
	"code": 200,
	"value": {
		"expires": 0,
		"active": true,
		"modified": 1511514896309,
		"accounts": {
			"3tj": {
				"created": 1511515905647,
				"planId": "x",
				"active": true,
				"expires": 0,
				"modified": 1511515905647
			},
			"3ti": {
				"active": true,
				"expires": 0,
				"modified": 1511515549667,
				"created": 1511515549667,
				"planId": "x"
			},
			"3th": {
				"created": 1511514896309,
				"planId": "x",
				"active": true,
				"expires": 0,
				"modified": 1511514896309
			},
			"3tk": {
				"planId": "x",
				"active": true,
				"created": 1511516984937,
				"modified": 1511516984937,
				"expires": 0
			}
		},
		"created": 1511514896309,
		"planId": "x"
	},
	"newProfile": false,
	"accountId": "3tk",
	"operation": "admin/addAccount",
	"method": "set"
}
```
## getAccount
This returns a subset of the profile for the given account.
```
api.get ("/v2/admin/account/3ti?admin=ADMINKEY&authid=uuu")
```

```
{
	"accountId": "3ti",
	"ok": true,
	"code": 200,
	"value": {
		"planId": "x",
		"active": true,
		"expires": 0,
		"modified": 1511515549667,
		"created": 1511515549667
	},
	"operation": "admin/getAccount"
}
```
##removeAccount
This removes the given account, and returns the updated profile, minus the deleted account
```
api.delete ("/v2/admin/account/3tk?admin=ADMINKEY&authid=uuu")
```

```
{
	"ok": true,
	"code": 204,
	"value": {
		"modified": 1511514896309,
		"accounts": {
			"3th": {
				"created": 1511514896309,
				"planId": "x",
				"active": true,
				"expires": 0,
				"modified": 1511514896309
			},
			"3tl": {
				"planId": "x",
				"active": true,
				"expires": 0,
				"modified": 1511518078060,
				"created": 1511518078060
			},
			"3tm": {
				"planId": "x",
				"active": true,
				"expires": 0,
				"modified": 1511518118595,
				"created": 1511518118595
			},
			"3tj": {
				"planId": "x",
				"active": true,
				"expires": 0,
				"modified": 1511515905647,
				"created": 1511515905647
			}
		},
		"created": 1511514896309,
		"planId": "x",
		"expires": 0,
		"active": true
	},
	"newProfile": false,
	"accountId": "3tk",
	"operation": "admin/removeAccount",
	"method": "remove"
}
```
##removeProfile
This removes the given profile
```
api.delete ("/v2/admin/profile?admin=ADMINKEY&authid=uuu")
```

```