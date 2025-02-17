import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useWallet } from '@txnlab/use-wallet-react'
import { isAxiosError } from 'axios'
import { ArrowUpRight, Check, Monitor, MonitorCheck, WalletMinimal } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'
import { z } from 'zod'
import { addValidator } from '@/api/contracts'
import { fetchNfd } from '@/api/nfd'
import { AlgoSymbol } from '@/components/AlgoSymbol'
import { InfoPopover } from '@/components/InfoPopover'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Constraints } from '@/interfaces/validator'
import { getAddValidatorFormSchema, getEpochLengthMinutes } from '@/utils/contracts'
// import { validatorAutoFill } from '@/utils/development'
import { getNfdAppFromViteEnvironment } from '@/utils/network/getNfdConfig'
import { isValidName, trimExtension } from '@/utils/nfd'
import { cn } from '@/utils/ui'

const nfdAppUrl = getNfdAppFromViteEnvironment()

interface AddValidatorFormProps {
  constraints: Constraints
}

export function AddValidatorForm({ constraints }: AddValidatorFormProps) {
  const [nfdAppId, setNfdAppId] = React.useState<number>(0)
  const [isFetchingAppId, setIsFetchingAppId] = React.useState(false)
  const [epochTimeframe, setEpochTimeframe] = React.useState('minutes')
  const [isSigning, setIsSigning] = React.useState(false)

  const { transactionSigner, activeAddress } = useWallet()

  const navigate = useNavigate({ from: '/add' })

  const formSchema = getAddValidatorFormSchema(constraints)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      owner: '',
      manager: '',
      nfdForInfo: '',
      entryGatingType: '0',
      entryGatingValue: '',
      gatingAssetMinBalance: '',
      rewardTokenId: '',
      rewardPerPayout: '',
      payoutEveryXMins: '',
      percentToValidator: '',
      validatorCommissionAddress: '',
      minEntryStake: '',
      poolsPerNode: '1',
    },
  })

  const { errors } = form.formState

  const fetchNfdForInfo = async (value: string) => {
    try {
      const nfd = await fetchNfd(value, { view: 'brief' })

      if (nfd.owner !== activeAddress) {
        throw new Error('NFD not owned by active address')
      }

      // If we have an app id, clear error if it exists
      form.clearErrors('nfdForInfo')
      setNfdAppId(nfd.appID!)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      let message: string
      if (isAxiosError(error) && error.response) {
        if (error.response.status === 404) {
          message = 'NFD app ID not found'
        } else {
          console.error(error)
          message = 'Failed to fetch NFD'
        }
      } else {
        // Handle non-HTTP errors
        console.error(error)
        message = error.message
      }
      form.setError('nfdForInfo', { type: 'manual', message })
    } finally {
      setIsFetchingAppId(false)
    }
  }

  const debouncedNfdCheck = useDebouncedCallback(async (value) => {
    const isValid = await form.trigger('nfdForInfo')
    if (isValid) {
      await fetchNfdForInfo(value)
    } else {
      setIsFetchingAppId(false)
    }
  }, 500)

  const nfdForInfo = form.watch('nfdForInfo')

  const showPrimaryMintButton =
    !isFetchingAppId &&
    nfdAppId === 0 &&
    errors.nfdForInfo?.message === 'NFD app ID not found' &&
    isValidName(nfdForInfo)

  const mintNfdUrl = showPrimaryMintButton
    ? `${nfdAppUrl}/mint?q=${trimExtension(nfdForInfo)}`
    : `${nfdAppUrl}/mint`

  const selectedGatingType = form.watch('entryGatingType')

  const isEntryGatingEnabled = ['1', '2', '3', '4'].includes(String(selectedGatingType))
  const isGatingAssetMinBalanceEnabled = ['1', '2', '3'].includes(String(selectedGatingType))

  const gatingValueInfo = React.useMemo(() => {
    switch (String(selectedGatingType)) {
      case '1':
        return {
          label: 'Asset creator account',
          description: 'Must hold asset created by this account to enter pool',
        }
      case '2':
        return {
          label: 'Asset ID',
          description: 'Must hold asset with this ID to enter pool',
        }
      case '3':
        return {
          label: 'Asset creator NFD',
          description: 'Must hold asset created by an account linked to this NFD to enter pool',
        }
      case '4':
        return {
          label: 'Root/parent NFD',
          description: 'Must hold a segment of this root/parent NFD to enter pool',
        }
      default:
        return {
          label: 'Unknown',
          description: 'Unknown',
        }
    }
  }, [selectedGatingType])

  const infoPopoverClassName = 'mx-1.5 relative top-0.5 sm:mx-1 sm:top-0'

  const toastIdRef = React.useRef(`toast-${Date.now()}-${Math.random()}`)
  const TOAST_ID = toastIdRef.current

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const toastId = `${TOAST_ID}-validator`

    try {
      setIsSigning(true)

      if (!activeAddress) {
        throw new Error('No active address')
      }

      toast.loading('Sign transactions to add validator...', { id: toastId })

      const payoutEveryXMins = getEpochLengthMinutes(values.payoutEveryXMins, epochTimeframe)

      const newValues = {
        ...values,
        payoutEveryXMins: String(payoutEveryXMins),
      }

      const validatorId = await addValidator(newValues, nfdAppId, transactionSigner, activeAddress)

      toast.success(
        <div className="flex items-center gap-x-2">
          <MonitorCheck className="h-5 w-5 text-foreground" />
          <span>Validator {validatorId} created!</span>
        </div>,
        {
          id: toastId,
          duration: 5000,
        },
      )

      await navigate({ to: '/' })
    } catch (error) {
      toast.error('Failed to create validator', { id: toastId })
      console.error(error)
    }
  }

  return (
    <div className="mb-12">
      <p className="text-sm text-muted-foreground">
        Fields marked with <span className="text-primary">*</span> are required
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6">
          <div className="grid gap-y-8">
            <fieldset className="grid gap-6 rounded-lg border p-6 max-w-3xl">
              <legend className="-ml-1 px-1 text-lg font-medium">Accounts</legend>

              <FormField
                control={form.control}
                name="owner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Owner account
                      <InfoPopover className={infoPopoverClassName}>
                        Account that controls config (cold wallet recommended)
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <div className="flex items-center gap-x-3">
                      <FormControl>
                        <Input
                          className="font-mono"
                          placeholder=""
                          autoComplete="new-password"
                          spellCheck="false"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault()
                          form.setValue('owner', activeAddress!, { shouldValidate: true })
                        }}
                      >
                        <WalletMinimal className="hidden mr-2 h-4 w-4 opacity-75 sm:inline" />
                        Autofill
                      </Button>
                    </div>
                    <FormMessage>{errors.owner?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="manager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Manager account
                      <InfoPopover className={infoPopoverClassName}>
                        Account that triggers payouts and keyreg transactions (must sign
                        transactions)
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <div className="flex items-center gap-x-3">
                      <FormControl>
                        <Input
                          className="font-mono"
                          placeholder=""
                          autoComplete="new-password"
                          spellCheck="false"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault()
                          form.setValue('manager', activeAddress!, { shouldValidate: true })
                        }}
                      >
                        <WalletMinimal className="hidden mr-2 h-4 w-4 opacity-75 sm:inline" />
                        Autofill
                      </Button>
                    </div>
                    <FormMessage>{errors.manager?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validatorCommissionAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Commission account
                      <InfoPopover className={infoPopoverClassName}>
                        Account that receives validator commission payments
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <div className="flex items-center gap-x-3">
                      <FormControl>
                        <Input
                          className="font-mono"
                          placeholder=""
                          autoComplete="new-password"
                          spellCheck="false"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault()
                          form.setValue('validatorCommissionAddress', activeAddress!, {
                            shouldValidate: true,
                          })
                        }}
                      >
                        <WalletMinimal className="hidden mr-2 h-4 w-4 opacity-75 sm:inline" />
                        Autofill
                      </Button>
                    </div>
                    <FormMessage>{errors.validatorCommissionAddress?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </fieldset>

            <fieldset className="grid gap-6 rounded-lg border p-6 max-w-3xl sm:grid-cols-2 md:grid-cols-3">
              <legend className="-ml-1 px-1 text-lg font-medium">Validator Settings</legend>
              <FormField
                control={form.control}
                name="minEntryStake"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Minimum entry stake
                      <InfoPopover className={infoPopoverClassName}>
                        Minimum stake required to enter a pool
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <AlgoSymbol verticalOffset={1} className="text-muted-foreground" />
                        </div>
                        <Input className="pl-7" placeholder="1000" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage>{errors.minEntryStake?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payoutEveryXMins"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Epoch length
                      <InfoPopover className={infoPopoverClassName}>
                        Frequency of rewards payouts
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <Input
                          className="rounded-r-none rounded-l-md focus:z-[2]"
                          placeholder=""
                          {...field}
                        />
                        <Select value={epochTimeframe} onValueChange={setEpochTimeframe}>
                          <FormControl>
                            <SelectTrigger className="w-[11rem] rounded-r-md rounded-l-none -ml-px">
                              <SelectValue placeholder="Select timeframe" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="minutes">Minutes</SelectItem>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </FormControl>
                    <FormMessage>{errors.payoutEveryXMins?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="percentToValidator"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Commission percent
                      <InfoPopover className={infoPopoverClassName}>
                        Payout percentage w/ up to four decimals (e.g., 5.0001)
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="5.0000" {...field} />
                    </FormControl>
                    <FormMessage>{errors.percentToValidator?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="poolsPerNode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Pools per node
                      <InfoPopover className={infoPopoverClassName}>
                        Number of pools to allow per node (max of 3 is recommended)
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select number of pools" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: constraints.maxPoolsPerNode }, (_, i) => i + 1).map(
                            (number) => (
                              <SelectItem key={number} value={String(number)}>
                                {number}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage>{errors.poolsPerNode?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nfdForInfo"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>
                      Associated NFD
                      <InfoPopover className={infoPopoverClassName}>
                        NFD which the validator uses to describe their validator pool (optional)
                      </InfoPopover>
                    </FormLabel>
                    <div className="flex items-center gap-x-3">
                      <div className="flex-1 relative">
                        <FormControl>
                          <Input
                            className={cn('', isFetchingAppId || nfdAppId > 0 ? 'pr-10' : '')}
                            placeholder=""
                            autoComplete="new-password"
                            spellCheck="false"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e) // Inform react-hook-form of the change
                              setNfdAppId(0) // Reset NFD app ID
                              setIsFetchingAppId(true) // Set fetching state
                              debouncedNfdCheck(e.target.value) // Perform debounced validation
                            }}
                          />
                        </FormControl>
                        <div
                          className={cn(
                            isFetchingAppId || nfdAppId > 0 ? 'opacity-100' : 'opacity-0',
                            'pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3',
                          )}
                        >
                          {isFetchingAppId ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-5 w-5 animate-spin opacity-25"
                              aria-hidden="true"
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          ) : nfdAppId ? (
                            <Check className="h-5 w-5 text-green-500" />
                          ) : null}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={showPrimaryMintButton ? 'default' : 'outline'}
                        asChild
                      >
                        <a href={mintNfdUrl} target="_blank" rel="noopener noreferrer">
                          <ArrowUpRight className="hidden mr-1 h-5 w-5 opacity-75 sm:inline" />
                          Mint NFD
                        </a>
                      </Button>
                    </div>
                    <FormMessage>{errors.nfdForInfo?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </fieldset>

            <fieldset className="grid gap-6 rounded-lg border p-6 max-w-3xl sm:grid-cols-2">
              <legend className="-ml-1 px-1 text-lg font-medium">Reward Token</legend>
              <p className="sm:col-span-2 text-sm text-muted-foreground">
                Reward token to be paid out to stakers (optional)
              </p>
              <FormField
                control={form.control}
                name="rewardTokenId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset ID</FormLabel>
                    <FormControl>
                      <Input placeholder="" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage>{errors.rewardTokenId?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rewardPerPayout"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount per payout</FormLabel>
                    <FormControl>
                      <Input placeholder="" {...field} />
                    </FormControl>
                    <FormMessage>{errors.rewardPerPayout?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </fieldset>

            <fieldset className="grid gap-6 rounded-lg border p-6 max-w-3xl sm:grid-cols-2">
              <legend className="-ml-1 px-1 text-lg font-medium">Entry Gating</legend>
              <p className="sm:col-span-2 text-sm text-muted-foreground">
                Require stakers to hold a qualified asset to enter pool (optional)
              </p>
              <FormField
                control={form.control}
                name="entryGatingType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Gating type
                      <InfoPopover className={infoPopoverClassName}>
                        Require stakers to hold a qualified asset to enter pool (optional)
                      </InfoPopover>
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(gatingType) => {
                          field.onChange(gatingType) // Inform react-hook-form of the change

                          form.setValue('entryGatingValue', '') // Reset gating value
                          form.clearErrors('entryGatingValue') // Clear any errors for gating value

                          const isNfdSegmentGating = gatingType === '4'
                          const gatingMinBalance = isNfdSegmentGating ? '1' : ''

                          form.setValue('gatingAssetMinBalance', gatingMinBalance) // Set/reset min balance
                          form.clearErrors('gatingAssetMinBalance') // Clear any errors for gating min balance
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select asset gating type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">None</SelectItem>
                          <SelectItem value="1">Asset by Creator Account</SelectItem>
                          <SelectItem value="2">Asset ID</SelectItem>
                          <SelectItem value="3">Asset Created by NFD</SelectItem>
                          <SelectItem value="4">NFD Segment</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage>{errors.entryGatingType?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="entryGatingValue"
                render={({ field }) => (
                  <FormItem className={cn({ hidden: !isEntryGatingEnabled })}>
                    <FormLabel>
                      {gatingValueInfo.label}
                      <InfoPopover className={infoPopoverClassName}>
                        {gatingValueInfo.description}
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="" {...field} />
                    </FormControl>
                    <FormMessage>{errors.entryGatingValue?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gatingAssetMinBalance"
                render={({ field }) => (
                  <FormItem className={cn({ hidden: !isGatingAssetMinBalanceEnabled })}>
                    <FormLabel>
                      Minimum balance
                      <InfoPopover className={infoPopoverClassName}>
                        Minimum required balance of the entry gating asset
                      </InfoPopover>
                      <span className="text-primary">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="" {...field} />
                    </FormControl>
                    <FormMessage>{errors.gatingAssetMinBalance?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </fieldset>

            {/* <fieldset className="grid gap-6 rounded-lg border p-6 max-w-3xl sm:grid-cols-2">
              <legend className="-ml-1 px-1 text-lg font-medium">Sunsetting</legend>
              <p className="sm:col-span-2 text-sm text-muted-foreground">
                Set a sunset date for the validator (optional)
              </p>
              <FormField
                control={form.control}
                name="sunsettingOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Sunset date
                      <InfoPopover className={infoPopoverClassName}>Date when validator will sunset</InfoPopover>
                    </FormLabel>
                    <div className="flex items-center gap-x-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-[240px] h-9 pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground',
                              )}
                            >
                              {field.value ? (
                                dayjs.unix(Number(field.value)).format('LL')
                              ) : (
                                <span>Select a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              field.value !== ''
                                ? dayjs.unix(Number(field.value)).toDate()
                                : undefined
                            }
                            onSelect={(date) => field.onChange(dayjs(date).unix().toString())}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault()
                          form.setValue('sunsettingOn', '', { shouldValidate: true })
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                    <FormMessage>{errors.sunsettingOn?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sunsettingTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Sunset to (validator ID)
                      <InfoPopover className={infoPopoverClassName}>
                        Validator ID that the validator is moving to (if known)
                      </InfoPopover>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="" {...field} />
                    </FormControl>
                    <FormMessage>{errors.sunsettingTo?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </fieldset> */}
          </div>
          <div className="flex justify-between mt-12">
            {/* <Button
              variant="outline"
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                form.reset(validatorAutoFill(activeAddress as string))
              }}
            >
              Autofill
            </Button> */}
            <Button
              type="submit"
              size="lg"
              className="w-full text-base sm:w-auto"
              disabled={isSigning || isFetchingAppId}
            >
              <Monitor className="mr-2 h-5 w-5" />
              Add Validator
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
